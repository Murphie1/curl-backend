import * as k8s from "@kubernetes/client-node";
import { exec } from "child_process";
import { randomUUID } from "crypto";
import { parse } from "shell-quote";
import { promisify } from "util";

const kc = new k8s.KubeConfig();
kc.loadFromCluster();
const k8sApi = kc.makeApiClient(k8s.CoreV1Api);
const execAsync = promisify(exec);

export async function runCurlPod(curlCommand: string): Promise<string> {
  const jobId = `curl-${randomUUID().slice(0, 8)}`;
  const namespace = "default";

  const parsedArgs = parse(curlCommand)
    .filter(arg => typeof arg === 'string')
    .map(arg => String(arg));

  if (parsedArgs.length === 0) {
    throw new Error("Empty curl command");
  }

  const args = parsedArgs[0] === 'curl' ? parsedArgs.slice(1) : parsedArgs;

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
        image: "curlimages/curl:latest",
        args: args,
        resources: {
          limits: { memory: "64Mi", cpu: "100m" }
        }
      }],
      restartPolicy: "Never"
    }
  };

  let podCreated = false;
  try {
    // Create pod using API (keep this part — it's working)
    await k8sApi.createNamespacedPod({ namespace, body: pod as any });
    podCreated = true;

    // Wait for pod to complete using kubectl
    for (let retries = 0; retries < 30; retries++) {
      try {
        const { stdout } = await execAsync(`kubectl get pod ${jobId} -n ${namespace} -o json`);
        const podStatus = JSON.parse(stdout);
        const phase = podStatus.status?.phase;
        if (phase === "Succeeded" || phase === "Failed") break;
      } catch (e) {
        console.warn("kubectl status check failed", e);
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Fetch logs using kubectl
    try {
      const { stdout } = await execAsync(`kubectl logs ${jobId} -n ${namespace} curl`);
      return stdout.trim();
    } catch (error: any) {
      throw new Error(`Error fetching logs with kubectl: ${error?.message || "Unknown error"}`);
    }
  } finally {
    // Delete pod using kubectl
    if (podCreated) {
      try {
        await execAsync(`kubectl delete pod ${jobId} -n ${namespace}`);
      } catch (e) {
        console.error("Pod deletion via kubectl failed:", e);
      }
    }
  }
}
