import { TerminalSession } from "../../index";

const session = await TerminalSession.create({ shell: "/bin/bash", cols: 120, rows: 36 });
const _raw: string[] = [];
const _stop = session.onEvent?.(() => {});
await new Promise((r) => setTimeout(r, 300));
const _unsubscribe = session.emulator;
await session.write("cagent\n");
await new Promise((r) => setTimeout(r, 5000));
console.log(JSON.stringify(session.snapshot("text")));
session.close();
