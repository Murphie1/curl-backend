import * as k8s from "@kubernetes/client-node";
import { PassThrough } from "stream";
import { randomUUID } from "crypto";
import { parse } from "shell-quote";

const kc = new k8s.KubeConfig();
kc.loadFromDefault();
const k8sApi = kc.makeApiClient(k8s.CoreV1Api);
const log = new k8s.Log(kc);

export async function runCurlPod(curlCommand: string): Promise<string> {
  const jobId = `curl-${randomUUID().slice(0, 8)}`;
  const namespace = "default";
  
  // Parse command and handle special characters
  const parsedArgs = parse(curlCommand)
    .filter(arg => typeof arg === 'string') // Remove non-string tokens
    .map(arg => String(arg)); // Ensure all args are strings

  if (parsedArgs.length === 0) {
    throw new Error("Empty curl command");
  }

  // Remove the initial 'curl' if present
  const args = parsedArgs[0] === 'curl' ? parsedArgs.slice(1) : parsedArgs;

  // Define pod spec
  const pod = {
    apiVersion: "v1",
    kind: "Pod",
    metadata: {
      name: jobId,
      labels: { app: "curl-runner" }
    },
    spec: {
      containers: [{
        name: "curl",
        image: "curlimages/curl:latest", // Use official curl image
        args: args, // Pass processed arguments
        resources: {
          limits: { memory: "64Mi", cpu: "100m" }
        }
      }],
      restartPolicy: "Never"
    }
  };

  let podCreated = false;
  try {
    // Create pod
    await k8sApi.createNamespacedPod(namespace, pod as any);
    podCreated = true;

    // Wait for completion
    let status;
    for (let retries = 0; retries < 30; retries++) {
      const res = await k8sApi.readNamespacedPodStatus(jobId, namespace);
      status = res.body.status?.phase;
      if (status === "Succeeded" || status === "Failed") break;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Get logs
    const stream = new PassThrough();
    let logs = "";
    stream.on("data", chunk => logs += chunk.toString());
    
    await new Promise<void>((resolve, reject) => {
      log.log(namespace, jobId, "curl", stream, err => {
        err ? reject(err) : resolve();
      });
    });

    return logs.trim();
  } finally {
    // Cleanup pod
    if (podCreated) {
      try {
        await k8sApi.deleteNamespacedPod(jobId, namespace);
      } catch (e) {
        console.error("Pod deletion failed:", e);
      }
    }
  }
}
