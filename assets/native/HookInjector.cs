// SPDX-License-Identifier: GPL-3.0-or-later
// Loads the user-selected LunaHook DLL only into the explicitly bound game.
using System;
using System.IO;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
public static class HookInjector {
 [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr OpenProcess(uint access,bool inherit,int pid);
 [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr VirtualAllocEx(IntPtr p,IntPtr address,UIntPtr size,uint allocation,uint protect);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool WriteProcessMemory(IntPtr p,IntPtr address,byte[] data,UIntPtr size,out UIntPtr written);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] static extern IntPtr GetModuleHandle(string module);
 [DllImport("kernel32.dll",CharSet=CharSet.Ansi)] static extern IntPtr GetProcAddress(IntPtr module,string name);
 [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr CreateRemoteThread(IntPtr p,IntPtr attr,UIntPtr stack,IntPtr start,IntPtr parameter,uint flags,IntPtr id);
 [DllImport("kernel32.dll")] static extern uint WaitForSingleObject(IntPtr h,uint ms);
 [DllImport("kernel32.dll")] static extern bool GetExitCodeThread(IntPtr h,out uint code);
 [DllImport("kernel32.dll")] static extern bool VirtualFreeEx(IntPtr p,IntPtr address,UIntPtr size,uint free);
 [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
 [DllImport("kernel32.dll")] static extern bool IsWow64Process(IntPtr p,out bool wow);
 [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd,out uint pid);
 public static int Main(string[] args){
  IntPtr process=IntPtr.Zero,remote=IntPtr.Zero,thread=IntPtr.Zero;bool completed=false;
  try{
   if(args.Length!=5)throw new Exception("Expected PID, bound window, process name, start time and absolute LunaHook DLL path");
   int pid=Int32.Parse(args[0]);HookTarget.Validate((uint)pid,args[1],args[2],args[3]);
   if(pid==Process.GetCurrentProcess().Id)throw new Exception("Refusing self injection");
   string dll=Path.GetFullPath(args[4]);if(!File.Exists(dll)||Array.IndexOf(IntPtr.Size==8?new[]{"LunaHook64.dll","MeguLitHook64.dll","MeguLitScn64.dll","MeguLitRenpy64.dll","MeguLitKrkr64.dll"}:new[]{"LunaHook32.dll","MeguLitHook32.dll","MeguLitScn32.dll","MeguLitKrkr32.dll","MeguLitRenpy32.dll"},Path.GetFileName(dll))<0)throw new Exception("Missing or wrong-architecture LunaHook DLL");
   process=OpenProcess(0x43a,false,pid);if(process==IntPtr.Zero)throw new Exception("Unable to open bound game");
   bool wow;if(!IsWow64Process(process,out wow))throw new Exception("Unable to check game architecture");if(Environment.Is64BitOperatingSystem&&((!wow)!=(IntPtr.Size==8)))throw new Exception("Injector architecture differs from game");
   byte[] data=Encoding.Unicode.GetBytes(dll+"\0");remote=VirtualAllocEx(process,IntPtr.Zero,(UIntPtr)data.Length,0x3000,4);if(remote==IntPtr.Zero)throw new Exception("Unable to allocate DLL path");
   UIntPtr written;if(!WriteProcessMemory(process,remote,data,(UIntPtr)data.Length,out written)||written.ToUInt64()!=(ulong)data.Length)throw new Exception("Unable to send DLL path");
   IntPtr loader=GetProcAddress(GetModuleHandle("kernel32.dll"),"LoadLibraryW");if(loader==IntPtr.Zero)throw new Exception("LoadLibraryW unavailable");
   thread=CreateRemoteThread(process,IntPtr.Zero,UIntPtr.Zero,loader,remote,0,IntPtr.Zero);if(thread==IntPtr.Zero)throw new Exception("Unable to load LunaHook");
   completed=WaitForSingleObject(thread,10000)==0;if(!completed)throw new Exception("LunaHook load timed out");
   uint result;if(!GetExitCodeThread(thread,out result)||result==0)throw new Exception("Game could not load LunaHook DLL");return 0;
  }catch(Exception e){Console.Error.WriteLine(e.Message);return 1;}
  finally{if((completed||thread==IntPtr.Zero)&&remote!=IntPtr.Zero)VirtualFreeEx(process,remote,UIntPtr.Zero,0x8000);if(thread!=IntPtr.Zero)CloseHandle(thread);if(process!=IntPtr.Zero)CloseHandle(process);}
 }
}
