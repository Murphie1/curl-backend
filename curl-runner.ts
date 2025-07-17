import * as k8s from "@kubernetes/client-node";
import { PassThrough } from "stream";
import { randomUUID } from "crypto";
import { parse } from "shell-quote";

const kc = new k8s.KubeConfig();
kc.loadFromDefault(); // Loads ~/.kube/config
const k8sApi = kc.makeApiClient(k8s.CoreV1Api);
const log = new k8s.Log(kc);

export async function runCurlPod(curlCommand: string): Promise<string> {
  const jobId = `curl-${randomUUID().slice(0, 8)}`;
  const namespace = "default";

  // Define pod spec
   const pod = {
  apiVersion: "v1",
  kind: "Pod",
  metadata: {
    name: jobId,
    labels: { app: "curl-runner" }
  },
  spec: {
    containers: [
      {
        name: "curl",
        image: "murphyalbert/cookbooks:curl-pods-latest",
        args: parsedArgs,
        resources: {
          limits: {
            memory: "64Mi",
            cpu: "100m"
          }
        }
      }
    ],
    restartPolicy: "Never"
  }
};

  // Create the pod
  try {
  await k8sApi.createNamespacedPod({
    namespace, 
    body: pod as any
  });
  } catch (e: any) {
    console.log(e?.message || e?.response.body || "Unknown error");
  }
  // Wait for pod to complete
  let status = null;
  let retries = 0;
  while (retries < 30) {
    const res = await k8sApi.readNamespacedPodStatus({
      name: jobId, namespace
    });
    status = res.status?.phase;
    if (["Succeeded", "Failed"].includes(status!)) break;
    await new Promise((r: any) => setTimeout(r, 1000));
    retries++;
  }

  //if (status !== "Succeeded") {
   // await k8sApi.deleteNamespacedPod({
    //  name: jobId, 
    //  namespace
 //   }).catch(() => {});
  //  throw new Error(`Pod failed or timed out (status: ${status})`);
//  }

  // Capture logs using PassThrough stream
  const stream = new PassThrough();
  let logs = "";

  stream.on("data", (chunk) => {
    logs += chunk.toString();
  });

  await new Promise<void>((resolve, reject) => {
    log.log(namespace, jobId, "curl", stream, (err: any) => {
      if (err) reject(err);
      else resolve();
    });
  });

  // Delete pod after completion (or use ttlSecondsAfterFinished if needed)
  //await k8sApi.deleteNamespacedPod({
   // name: jobId,
  //  namespace,
//  }).catch(() => {});

  return logs.trim();
    }
