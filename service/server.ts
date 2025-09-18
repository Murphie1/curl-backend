import Fastify from "fastify";
import { runCurlPod } from "./curl-runner.js";

const app = Fastify();

app.post("/exec-curl", async (req, reply) => {
  const { curl } = req.body as { curl: string };

  if (!curl || !curl.startsWith("curl")) {
    return reply.status(400).send({ error: "Invalid curl command." });
  }

  try {
    const result = await runCurlPod(curl);
    return { output: result };
  } catch (err: any) {
    return reply.status(500).send({ error: err.message || err });
  }
});

app.listen({ port: 3000, host: "0.0.0.0" }, () => {
  console.log("Fastify server listening on port 3000");
});
