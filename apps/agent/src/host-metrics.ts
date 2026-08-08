import type koffiType from "koffi";

type FileTimeParts = {
  dwLowDateTime: number;
  dwHighDateTime: number;
};

type CpuSample = {
  idle: bigint;
  kernel: bigint;
  user: bigint;
};

type HostMetricsNative = {
  GetSystemTimes: (idle: FileTimeParts, kernel: FileTimeParts, user: FileTimeParts) => boolean;
  GlobalMemoryStatusEx: (status: Record<string, unknown>) => boolean;
  GetTickCount64: () => bigint;
  GetTickCount: () => number;
  GetLastInputInfo: (info: { cbSize: number; dwTime: number }) => boolean;
  LASTINPUTINFO_size: number;
  MEMORYSTATUSEX_size: number;
};

let native: HostMetricsNative | null = null;
let metricsErrorLogged = false;

const logMetricsError = (message: string): void => {
  if (!metricsErrorLogged) {
    console.warn(`[agent] host metrics failed: ${message}`);
    metricsErrorLogged = true;
  }
};

const loadNative = async (): Promise<HostMetricsNative | null> => {
  if (native) {
    return native;
  }

  try {
    const koffi = (await import("koffi")).default as typeof koffiType;

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

    native = {
      GetSystemTimes: kernel32.func("GetSystemTimes", "bool", [
        koffi.out(koffi.pointer(FILETIME)),
        koffi.out(koffi.pointer(FILETIME)),
        koffi.out(koffi.pointer(FILETIME)),
      ]),
      GlobalMemoryStatusEx: kernel32.func("GlobalMemoryStatusEx", "bool", [
        koffi.inout(koffi.pointer(MEMORYSTATUSEX)),
      ]),
      GetTickCount64: kernel32.func("GetTickCount64", "uint64", []),
      GetTickCount: kernel32.func("GetTickCount", "uint32", []),
      GetLastInputInfo: user32.func("GetLastInputInfo", "bool", [
        koffi.inout(koffi.pointer(LASTINPUTINFO)),
      ]),
      LASTINPUTINFO_size: koffi.sizeof(LASTINPUTINFO),
      MEMORYSTATUSEX_size: koffi.sizeof(MEMORYSTATUSEX),
    };
    metricsErrorLogged = false;
    return native;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logMetricsError(message);
    return null;
  }
};

const fileTimeToBigInt = (ft: FileTimeParts): bigint =>
  (BigInt(ft.dwHighDateTime) << 32n) | BigInt(ft.dwLowDateTime);

const readCpuSample = (loaded: HostMetricsNative): CpuSample | null => {
  const idle = {} as FileTimeParts;
  const kernel = {} as FileTimeParts;
  const user = {} as FileTimeParts;
  if (!loaded.GetSystemTimes(idle, kernel, user)) {
    logMetricsError("GetSystemTimes returned false");
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
  cpuPercent?: number;
  ramPercent: number;
  uptimeSec: number;
};

const readIdleMs = (loaded: HostMetricsNative): number => {
  const info = {
    cbSize: loaded.LASTINPUTINFO_size,
    dwTime: 0,
  };
  if (!loaded.GetLastInputInfo(info)) {
    logMetricsError("GetLastInputInfo returned false");
    return 0;
  }
  const tick = loaded.GetTickCount();
  return (tick - info.dwTime) >>> 0;
};

const readCpuPercent = (loaded: HostMetricsNative): number | undefined => {
  const current = readCpuSample(loaded);
  if (!current) {
    return 0;
  }

  const previous = previousCpu;
  previousCpu = current;
  if (!previous) {
    return undefined;
  }

  const idleDelta = current.idle - previous.idle;
  const kernelDelta = current.kernel - previous.kernel;
  const userDelta = current.user - previous.user;
  const totalDelta = kernelDelta + userDelta;
  if (totalDelta <= 0n) {
    return 0;
  }

  const busy = totalDelta - idleDelta;
  const percent = Number((busy * 10000n) / totalDelta) / 100;
  return Math.min(100, Math.max(0, percent));
};

const readRamPercent = (loaded: HostMetricsNative): number => {
  const status = {
    dwLength: 0,
    dwMemoryLoad: 0,
    ullTotalPhys: 0n,
    ullAvailPhys: 0n,
    ullTotalPageFile: 0n,
    ullAvailPageFile: 0n,
    ullTotalVirtual: 0n,
    ullAvailVirtual: 0n,
    ullAvailExtendedVirtual: 0n,
  };
  status.dwLength = loaded.MEMORYSTATUSEX_size;
  if (!loaded.GlobalMemoryStatusEx(status)) {
    logMetricsError("GlobalMemoryStatusEx returned false");
    return 0;
  }
  return Math.min(100, Math.max(0, status.dwMemoryLoad));
};

export const readHostMetrics = (): HostMetrics => {
  const loaded = native;
  if (!loaded) {
    return { idleMs: 0, cpuPercent: 0, ramPercent: 0, uptimeSec: 0 };
  }

  const cpuPercent = readCpuPercent(loaded);

  return {
    idleMs: readIdleMs(loaded),
    ...(cpuPercent !== undefined ? { cpuPercent } : {}),
    ramPercent: readRamPercent(loaded),
    uptimeSec: Math.floor(Number(loaded.GetTickCount64()) / 1000),
  };
};

export const initHostMetrics = async (): Promise<void> => {
  await loadNative();
};
