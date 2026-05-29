import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { apiRequest } from "./api";
import { clearSession, writeSession } from "./session";

type Options = Record<string, string | boolean>;

export function parseOptions(args: string[]) {
  const options: Options = {};
  const positional: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg.startsWith("--")) {
      const [key, value] = arg.slice(2).split("=", 2);
      if (value !== undefined) {
        options[key] = value;
      } else {
        const next = args[index + 1];
        if (next && !next.startsWith("--")) {
          options[key] = next;
          index += 1;
        } else {
          options[key] = true;
        }
      }
    } else {
      positional.push(arg);
    }
  }

  return { options, positional };
}

export async function runCommand(command: string, args: string[], apiUrl: string) {
  switch (command) {
    case "register":
      return register(args, apiUrl);
    case "login":
      return login(args, apiUrl);
    case "logout":
      await clearSession();
      console.log("logged out");
      return;
    case "help":
      printHelp();
      return;
    default:
      console.error(`unknown command: ${command}`);
      printHelp();
      process.exitCode = 1;
  }
}

export function printHelp() {
  console.log(`slops

Usage:
  slops
  slops --no-update

Inside the TUI, press h for help.
`);
}

async function register(args: string[], apiUrl: string) {
  const { options } = parseOptions(args);
  const username = stringOption(options.username) ?? (await prompt("username"));
  const password = stringOption(options.password) ?? (await prompt("password"));

  const result = await apiRequest<{
    user: { id: string; username: string };
    session: { token: string; expiresAt: string };
    recoveryKey: string;
  }>(
    apiUrl,
    "/api/auth/register",
    {
      method: "POST",
      body: { username, password },
    },
  );

  if (!result.ok) {
    console.error(result.message ?? result.error);
    process.exitCode = 1;
    return;
  }

  await writeSession({
    apiUrl,
    token: result.data.session.token,
    expiresAt: result.data.session.expiresAt,
    recoveryKey: result.data.recoveryKey,
    user: result.data.user,
  });

  console.log(`registered ${result.data.user.username}`);
  console.log(`recovery key: ${result.data.recoveryKey}`);
  console.log("it was also saved in your local slops user.json");
}

async function login(args: string[], apiUrl: string) {
  const { options } = parseOptions(args);
  const username = stringOption(options.username) ?? (await prompt("username"));
  const password = stringOption(options.password) ?? (await prompt("password"));

  const result = await apiRequest<{
    session: {
      token: string;
      expiresAt: string;
    };
    user: {
      id: string;
      username: string;
    };
  }>(apiUrl, "/api/auth/login", {
    method: "POST",
    body: { username, password },
  });

  if (!result.ok) {
    console.error(result.message ?? result.error);
    process.exitCode = 1;
    return;
  }

  await writeSession({
    apiUrl,
    token: result.data.session.token,
    expiresAt: result.data.session.expiresAt,
    user: result.data.user,
  });

  console.log("logged in");
}

async function prompt(label: string) {
  const rl = createInterface({ input, output });
  const answer = await rl.question(`${label}: `);
  rl.close();
  return answer.trim();
}

function stringOption(value: string | boolean | undefined) {
  return typeof value === "string" ? value : undefined;
}
