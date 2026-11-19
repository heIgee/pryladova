import type koffiType from "koffi";
import { agentLog } from "./logger.js";

export const WTS_SESSION_LOCK = 0x7;
export const WTS_SESSION_UNLOCK = 0x8;

export const sessionLockWtsEvent = (wparam: number): "lock" | "unlock" | null => {
  if (wparam === WTS_SESSION_LOCK) {
    return "lock";
  }
  if (wparam === WTS_SESSION_UNLOCK) {
    return "unlock";
  }
  return null;
};

const WM_WTSSESSION_CHANGE = 0x02b1;
const NOTIFY_FOR_THIS_SESSION = 0;
const HWND_MESSAGE = -3;
const WS_OVERLAPPED = 0x0000_0000;

type SessionLockHandlers = {
  onLock: () => void;
  onUnlock: () => void;
};

export const initSessionLock = async (handlers: SessionLockHandlers): Promise<() => void> => {
  if (process.platform !== "win32") {
    return () => {};
  }

  try {
    const koffi = (await import("koffi")).default as typeof koffiType;
    const user32 = koffi.load("user32.dll");
    const wtsapi32 = koffi.load("wtsapi32.dll");

    const WNDPROC = koffi.proto(
      "intptr __stdcall WndProc(intptr hwnd, uint32 msg, intptr wparam, intptr lparam)",
    );

    const DefWindowProcW = user32.func("DefWindowProcW", "intptr", [
      "intptr",
      "uint32",
      "intptr",
      "intptr",
    ]);
    const RegisterClassW = user32.func("RegisterClassW", "uint16", ["void *"]);
    const CreateWindowExW = user32.func("CreateWindowExW", "intptr", [
      "uint32",
      "str16",
      "str16",
      "uint32",
      "int32",
      "int32",
      "int32",
      "int32",
      "intptr",
      "intptr",
      "intptr",
      "void *",
    ]);
    const DestroyWindow = user32.func("DestroyWindow", "bool", ["intptr"]);
    const UnregisterClassW = user32.func("UnregisterClassW", "bool", ["str16", "intptr"]);
    const GetModuleHandleW = user32.func("GetModuleHandleW", "intptr", ["str16"]);
    const WTSRegisterSessionNotification = wtsapi32.func("WTSRegisterSessionNotification", "bool", [
      "intptr",
      "uint32",
    ]);
    const WTSUnRegisterSessionNotification = wtsapi32.func(
      "WTSUnRegisterSessionNotification",
      "bool",
      ["intptr"],
    );

    const className = "PryladovaSessionNotify";

    const wndProc = koffi.register((hwnd: bigint, msg: number, wparam: bigint, lparam: bigint) => {
      if (msg === WM_WTSSESSION_CHANGE) {
        const event = sessionLockWtsEvent(Number(wparam));
        if (event === "lock") {
          handlers.onLock();
        } else if (event === "unlock") {
          handlers.onUnlock();
        }
      }
      return DefWindowProcW(hwnd, msg, wparam, lparam);
    }, koffi.pointer(WNDPROC));

    const hInstance = GetModuleHandleW(null);

    const wndClass = {
      style: 0,
      lpfnWndProc: wndProc,
      cbClsExtra: 0,
      cbWndExtra: 0,
      hInstance,
      hIcon: 0,
      hCursor: 0,
      hbrBackground: 0,
      lpszMenuName: null,
      lpszClassName: className,
    };

    if (RegisterClassW(wndClass) === 0) {
      koffi.unregister(wndProc);
      agentLog.warn("session lock: RegisterClassW failed");
      return () => {};
    }

    const hwnd = CreateWindowExW(
      0,
      className,
      className,
      WS_OVERLAPPED,
      0,
      0,
      0,
      0,
      HWND_MESSAGE,
      0,
      hInstance,
      null,
    );

    if (hwnd === 0) {
      UnregisterClassW(className, hInstance);
      koffi.unregister(wndProc);
      agentLog.warn("session lock: CreateWindowExW failed");
      return () => {};
    }

    if (!WTSRegisterSessionNotification(hwnd, NOTIFY_FOR_THIS_SESSION)) {
      DestroyWindow(hwnd);
      UnregisterClassW(className, hInstance);
      koffi.unregister(wndProc);
      agentLog.warn("session lock: WTSRegisterSessionNotification failed");
      return () => {};
    }

    return () => {
      WTSUnRegisterSessionNotification(hwnd);
      DestroyWindow(hwnd);
      UnregisterClassW(className, hInstance);
      koffi.unregister(wndProc);
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    agentLog.warn(`session lock unavailable: ${message}`);
    return () => {};
  }
};
