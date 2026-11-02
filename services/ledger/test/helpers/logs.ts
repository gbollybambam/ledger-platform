import { Writable } from 'node:stream';

export interface CapturedLogs {
  stream: Writable;
  text(): string;
  lines(): unknown[];
}

export function captureLogs(): CapturedLogs {
  let text = '';
  const stream = new Writable({
    write(chunk: unknown, _encoding, callback) {
      text += typeof chunk === 'string' ? chunk : String(chunk);
      callback();
    },
  });

  return {
    stream,
    text: () => text,
    lines: () =>
      text
        .split(/\r?\n/)
        .filter((line) => line.length > 0)
        .map((line) => JSON.parse(line) as unknown),
  };
}
