import * as k8s from "@kubernetes/client-node";
import { randomUUID } from "crypto";
import { parse } from "shell-quote";

const kc = new k8s.KubeConfig();
kc.loadFromCluster();
const coreV1 = kc.makeApiClient(k8s.CoreV1Api);
const log = new k8s.Log(kc);

export async function runCurlPod(curlCommand: string): Promise<string> {
  const jobId = `curl-${randomUUID()}`;
  const namespace = "default";

  // Parse curl command into args
  const parsedArgs = parse(curlCommand)
    .filter((arg) => typeof arg === "string")
    .map((arg: string) => String(arg));

  if (parsedArgs.length === 0) {
    throw new Error("Empty curl command");
  }

  const args = parsedArgs[0] === "curl" ? parsedArgs.slice(1) : parsedArgs;

  const pod: k8s.V1Pod = {
    apiVersion: "v1",
    kind: "Pod",
    metadata: {
      name: jobId,
      labels: { app: "curl-runner" },
    },
    spec: {
      containers: [
        {
          name: "curl",
          image: "curlimages/curl:latest",
          args,
          resources: {
            limits: { memory: "64Mi", cpu: "100m" },
          },
        },
      ],
      restartPolicy: "Never",
    },
  };

  let podCreated = false;
  try {
    // Create pod
    await coreV1.createNamespacedPod({ namespace, body: pod });
    podCreated = true;

    // Poll pod phase until Succeeded/Failed (max ~30s)
    for (let retries = 0; retries < 30; retries++) {
      const res = await coreV1.readNamespacedPod({ name: jobId, namespace });
      const phase = res.status?.phase;
      if (phase === "Succeeded" || phase === "Failed") {
        break;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }

    // Get logs
    try {
      const logs = await new Promise<string>((resolve, reject) => {
        let logData = "";
        log.log(
          namespace,
          jobId,
          "curl",
          process.stdout, // optional live streaming
          (data) => {
            logData += data.toString();
          },
          { follow: false, pretty: false, timestamps: false }
        ).then(() => resolve(logData)).catch(reject);
      });
      return logs.trim();
    } catch (err: any) {
      throw new Error(
        `Error fetching logs with Kubernetes API: ${err?.message || "Unknown error"}`
      );
    }
  } finally {
    if (podCreated) {
      try {
        await coreV1.deleteNamespacedPod({ name: jobId, namespace });
      } catch (e) {
        console.error("Pod deletion via API failed:", e);
      }
    }
  }
}
