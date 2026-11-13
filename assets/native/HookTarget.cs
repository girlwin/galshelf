// SPDX-License-Identifier: GPL-3.0-or-later
using System;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Text;
using System.Runtime.InteropServices;
// A PID by itself can be reused. Bind the process name and creation timestamp
// captured by our window selector as well as the window ID. Some desktops do
// not expose HWND lookups to a helper; that does not invalidate process identity.
public static class HookTarget {
 [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd,out uint pid);
 [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr OpenProcess(uint access,bool inherit,uint pid);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool QueryFullProcessImageName(IntPtr process,uint flags,StringBuilder path,ref int size);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetProcessTimes(IntPtr process,out System.Runtime.InteropServices.ComTypes.FILETIME created,out System.Runtime.InteropServices.ComTypes.FILETIME exited,out System.Runtime.InteropServices.ComTypes.FILETIME kernel,out System.Runtime.InteropServices.ComTypes.FILETIME user);
 [DllImport("kernel32.dll")] static extern bool GetExitCodeProcess(IntPtr process,out uint code);
 [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr process);
 public static void Validate(uint pid,string window,string name,string started){
  long hwnd;if(pid==0||pid==Process.GetCurrentProcess().Id||!Int64.TryParse(window,out hwnd)||hwnd==0||String.IsNullOrEmpty(name)||String.IsNullOrEmpty(started))throw new Exception("Missing explicitly bound game identity");
  IntPtr process=OpenProcess(0x1000,false,pid);if(process==IntPtr.Zero)throw new Exception("Unable to query the explicitly bound game");
  try{var path=new StringBuilder(32768);int size=path.Capacity;uint exit;System.Runtime.InteropServices.ComTypes.FILETIME created,exited,kernel,user;
   if(!QueryFullProcessImageName(process,0,path,ref size)||!GetProcessTimes(process,out created,out exited,out kernel,out user)||!GetExitCodeProcess(process,out exit))throw new Exception("Unable to verify bound game identity");
   long filetime=((long)created.dwHighDateTime<<32)|(uint)created.dwLowDateTime;
   if(exit!=259||!String.Equals(Path.GetFileNameWithoutExtension(path.ToString()),name,StringComparison.OrdinalIgnoreCase)||DateTime.FromFileTimeUtc(filetime).Ticks.ToString(CultureInfo.InvariantCulture)!=started)throw new Exception("Bound game process changed; bind the game again");
  }finally{CloseHandle(process);}
  uint owner;GetWindowThreadProcessId(new IntPtr(hwnd),out owner);if(owner!=0&&owner!=pid)throw new Exception("Bound game window belongs to another process");
 }
}
