const writeLine = (stream: NodeJS.WriteStream, message: string): void => {
  stream.write(`${message}\n`);
};

export const agentLog = {
  info(message: string): void {
    writeLine(process.stdout, `[agent] ${message}`);
  },
  warn(message: string): void {
    writeLine(process.stderr, `[agent] ${message}`);
  },
  error(message: string): void {
    writeLine(process.stderr, `[agent] ${message}`);
  },
};
