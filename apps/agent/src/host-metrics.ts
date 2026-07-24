import koffi from "koffi";

const kernel32 = koffi.load("kernel32.dll");
const user32 = koffi.load("user32.dll");

const FILETIME = koffi.struct("FILETIME", {
  dwLowDateTime: "uint32",
  dwHighDateTime: "uint32",
});

const MEMORYSTATUSEX = koffi.struct("MEMORYSTATUSEX", {
  dwLength: "uint32",
  dwMemoryLoad: "uint32",
  ullTotalPhys: "uint64",
  ullAvailPhys: "uint64",
  ullTotalPageFile: "uint64",
  ullAvailPageFile: "uint64",
  ullTotalVirtual: "uint64",
  ullAvailVirtual: "uint64",
  ullAvailExtendedVirtual: "uint64",
});

const LASTINPUTINFO = koffi.struct("LASTINPUTINFO", {
  cbSize: "uint32",
  dwTime: "uint32",
});

const GetSystemTimes = kernel32.func("GetSystemTimes", "bool", [
  koffi.out(koffi.pointer(FILETIME)),
  koffi.out(koffi.pointer(FILETIME)),
  koffi.out(koffi.pointer(FILETIME)),
]);
const GlobalMemoryStatusEx = kernel32.func("GlobalMemoryStatusEx", "bool", [
  koffi.inout(koffi.pointer(MEMORYSTATUSEX)),
]);
const GetTickCount64 = kernel32.func("GetTickCount64", "uint64", []);
const GetTickCount = kernel32.func("GetTickCount", "uint32", []);
const GetLastInputInfo = user32.func("GetLastInputInfo", "bool", [
  koffi.inout(koffi.pointer(LASTINPUTINFO)),
]);

type FileTimeParts = {
  dwLowDateTime: number;
  dwHighDateTime: number;
};

type CpuSample = {
  idle: bigint;
  kernel: bigint;
  user: bigint;
};

const fileTimeToBigInt = (ft: FileTimeParts): bigint =>
  (BigInt(ft.dwHighDateTime) << 32n) | BigInt(ft.dwLowDateTime);

const readCpuSample = (): CpuSample | null => {
  const idle = {} as FileTimeParts;
  const kernel = {} as FileTimeParts;
  const user = {} as FileTimeParts;
  if (!GetSystemTimes(idle, kernel, user)) {
    return null;
  }
  return {
    idle: fileTimeToBigInt(idle),
    kernel: fileTimeToBigInt(kernel),
    user: fileTimeToBigInt(user),
  };
};

let previousCpu: CpuSample | null = null;

export type HostMetrics = {
  idleMs: number;
  cpuPercent: number;
  ramPercent: number;
  uptimeSec: number;
};

const readIdleMs = (): number => {
  const info = {
    cbSize: koffi.sizeof(LASTINPUTINFO),
    dwTime: 0,
  };
  if (!GetLastInputInfo(info)) {
    return 0;
  }
  const tick = GetTickCount();
  return Math.max(0, tick - info.dwTime);
};

const readCpuPercent = (): number => {
  const current = readCpuSample();
  if (!current) {
    return 0;
  }

  const previous = previousCpu;
  previousCpu = current;
  if (!previous) {
    return 0;
  }

  const idleDelta = current.idle - previous.idle;
  const kernelDelta = current.kernel - previous.kernel;
  const userDelta = current.user - previous.user;
  // Kernel time includes idle time on Windows.
  const totalDelta = kernelDelta + userDelta;
  if (totalDelta <= 0n) {
    return 0;
  }

  const busy = totalDelta - idleDelta;
  const percent = Number((busy * 10000n) / totalDelta) / 100;
  return Math.min(100, Math.max(0, percent));
};

const readRamPercent = (): number => {
  const status = {
    dwLength: koffi.sizeof(MEMORYSTATUSEX),
    dwMemoryLoad: 0,
    ullTotalPhys: 0n,
    ullAvailPhys: 0n,
    ullTotalPageFile: 0n,
    ullAvailPageFile: 0n,
    ullTotalVirtual: 0n,
    ullAvailVirtual: 0n,
    ullAvailExtendedVirtual: 0n,
  };
  if (!GlobalMemoryStatusEx(status)) {
    return 0;
  }
  return Math.min(100, Math.max(0, status.dwMemoryLoad));
};

export const readHostMetrics = (): HostMetrics => ({
  idleMs: readIdleMs(),
  cpuPercent: readCpuPercent(),
  ramPercent: readRamPercent(),
  uptimeSec: Math.floor(Number(GetTickCount64()) / 1000),
});
