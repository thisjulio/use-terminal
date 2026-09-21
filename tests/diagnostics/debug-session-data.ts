import { TerminalSession } from "../../index";

const session = await TerminalSession.create({ shell: "/bin/bash", cols: 120, rows: 36 });
const events = session.events();
const reader = events[Symbol.asyncIterator]();
await session.write("cagent\n");
const end = Date.now() + 10000;
while (Date.now() < end) {
  const result = await Promise.race([reader.next(), new Promise<null>((r) => setTimeout(() => r(null), 1000))]);
  if (!result || result.done) continue;
  const event = result.value;
  if (event.type === "data") console.log(`${Date.now()} DATA ${JSON.stringify(event.data)}`);
}
session.close();
