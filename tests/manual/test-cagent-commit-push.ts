import { TerminalSession } from "../../index";

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const screenshotOptions = { cellWidth: 10, cellHeight: 20, fontSize: 16 };

function isReady(text: string): boolean {
  return /^\s*cagent\s*\|.*\bready\s*$/m.test(text);
}

function hasWorkingState(text: string): boolean {
  return /thinking|queued input|running tool|working/i.test(text);
}

async function main(): Promise<void> {
  const session = await TerminalSession.create({
    command: "cagent",
    args: ["--yes", "--permission-mode", "auto"],
    cols: 180,
    rows: 50,
  });
  let screenshotNumber = 0;
  const capture = async (label: string): Promise<string> => {
    const path = `/tmp/cagent-functional-${String(++screenshotNumber).padStart(2, "0")}-${label}.png`;
    await Bun.write(path, session.screenshotBytes("png", screenshotOptions));
    const text = session.snapshot("text").text ?? "";
    console.log(`[screenshot] ${path}`);
    return text;
  };

  try {
    await wait(7000);
    let text = await capture("open");
    if (!isReady(text)) throw new Error("cagent did not reach ready after startup");

    await session.write("/variant low");
    await session.sendKey("ENTER");
    await wait(1500);
    text = await capture("variant-low");
    if (!text.includes("variant set to: low")) throw new Error("variant low was not confirmed");
    if (!isReady(text)) throw new Error("cagent did not return to ready after setting variant");

    await session.write("commit and push");
    await session.sendKey("ENTER");
    await wait(1000);
    text = await capture("prompt-submitted");
    if (!text.includes("commit and push")) throw new Error("prompt was not displayed");

    let sawWorking = hasWorkingState(text);
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
      await wait(1000);
      text = session.snapshot("text").text ?? "";
      sawWorking ||= hasWorkingState(text);
      if (sawWorking && isReady(text)) {
        await capture("ready-final");
        console.log("SUCCESS: cagent returned to ready after commit and push");
        return;
      }
    }
    await capture("timeout");
    throw new Error(`cagent did not return to ready within timeout; sawWorking=${sawWorking}`);
  } finally {
    session.close();
  }
}

await main();
