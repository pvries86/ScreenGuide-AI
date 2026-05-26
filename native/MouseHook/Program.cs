using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text.Json;


internal static class Program
{
    private static readonly NativeMethods.LowLevelMouseProc HookProc = HookCallback;
    private static readonly JsonSerializerOptions SerializerOptions = new JsonSerializerOptions
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };
    private static IntPtr _hookHandle = IntPtr.Zero;

    private static readonly HashSet<NativeMethods.MouseMessages> TrackedMessages =
    [
        NativeMethods.MouseMessages.WM_LBUTTONDOWN,
        NativeMethods.MouseMessages.WM_RBUTTONDOWN,
        NativeMethods.MouseMessages.WM_MBUTTONDOWN
    ];

    private static void Main()
    {
        AppDomain.CurrentDomain.ProcessExit += (_, _) => Cleanup();
        Console.CancelKeyPress += (_, e) =>
        {
            Cleanup();
            e.Cancel = true;
        };

        _hookHandle = NativeMethods.SetWindowsHookEx(NativeMethods.WH_MOUSE_LL, HookProc, NativeMethods.GetModuleHandle(null), 0);
        if (_hookHandle == IntPtr.Zero)
        {
            var errorPayload = JsonSerializer.Serialize(new { type = "error", message = "Failed to install mouse hook", error = Marshal.GetLastWin32Error() });
            Console.Error.WriteLine(errorPayload);
            return;
        }

        NativeMethods.MSG msg;
        while (NativeMethods.GetMessage(out msg, IntPtr.Zero, 0, 0))
        {
            // no-op; loop keeps the hook alive until WM_QUIT
        }

        Cleanup();
    }

    private static void Cleanup()
    {
        if (_hookHandle != IntPtr.Zero)
        {
            NativeMethods.UnhookWindowsHookEx(_hookHandle);
            _hookHandle = IntPtr.Zero;
        }
    }

    private static IntPtr HookCallback(int nCode, IntPtr wParam, IntPtr lParam)
    {
        if (nCode >= 0)
        {
            var message = (NativeMethods.MouseMessages)wParam;
            if (TrackedMessages.Contains(message))
            {
                var data = Marshal.PtrToStructure<NativeMethods.MSLLHOOKSTRUCT>(lParam);
                var evt = new MouseEvent(
                    Type: message switch
                    {
                        NativeMethods.MouseMessages.WM_LBUTTONDOWN => "left_down",
                        NativeMethods.MouseMessages.WM_RBUTTONDOWN => "right_down",
                        NativeMethods.MouseMessages.WM_MBUTTONDOWN => "middle_down",
                        _ => "other"
                    },
                    X: data.pt.x,
                    Y: data.pt.y,
                    Timestamp: data.time
                );

                Console.WriteLine(JsonSerializer.Serialize(evt, SerializerOptions));
                Console.Out.Flush();
            }
        }

        return NativeMethods.CallNextHookEx(_hookHandle, nCode, wParam, lParam);
    }

    private sealed record MouseEvent(string Type, int X, int Y, uint Timestamp);
}

internal static class NativeMethods
{
    public const int WH_MOUSE_LL = 14;

    public enum MouseMessages
    {
        WM_MOUSEMOVE = 0x0200,
        WM_LBUTTONDOWN = 0x0201,
        WM_LBUTTONUP = 0x0202,
        WM_RBUTTONDOWN = 0x0204,
        WM_RBUTTONUP = 0x0205,
        WM_MBUTTONDOWN = 0x0207,
        WM_MBUTTONUP = 0x0208
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct POINT
    {
        public int x;
        public int y;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct MSLLHOOKSTRUCT
    {
        public POINT pt;
        public uint mouseData;
        public uint flags;
        public uint time;
        public IntPtr dwExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct MSG
    {
        public IntPtr hwnd;
        public uint message;
        public IntPtr wParam;
        public IntPtr lParam;
        public uint time;
        public POINT pt;
        public uint lPrivate;
    }

    public delegate IntPtr LowLevelMouseProc(int nCode, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern IntPtr SetWindowsHookEx(int idHook, LowLevelMouseProc lpfn, IntPtr hMod, uint dwThreadId);

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool UnhookWindowsHookEx(IntPtr hhk);

    [DllImport("user32.dll")]
    public static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool GetMessage(out MSG lpMsg, IntPtr hWnd, uint wMsgFilterMin, uint wMsgFilterMax);

    [DllImport("kernel32.dll", CharSet = CharSet.Auto)]
    public static extern IntPtr GetModuleHandle(string? lpModuleName);
}

