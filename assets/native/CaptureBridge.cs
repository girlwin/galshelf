// SPDX-License-Identifier: GPL-3.0-or-later
// Read-only derivative of MeguLit 1.3.5 native/HookBridge.cs (ilynthn and contributors).
// Reuses its LunaHook C ABI declarations, thread identities, source-stream selection
// and explicit process binding. No embed/write-back API is loaded or called.
using System;
using System.IO;
using System.Linq;
using System.Diagnostics;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
public static class CaptureBridge {
 [StructLayout(LayoutKind.Sequential)] public struct ThreadParam {public uint processId;public ulong addr,ctx,ctx2;public string Key(){return addr.ToString("x")+":"+ctx.ToString("x")+":"+ctx2.ToString("x");}}
 [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate void ProcessEvent(uint pid);
 [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate void CreateEvent([MarshalAs(UnmanagedType.LPWStr)]string code,[MarshalAs(UnmanagedType.LPStr)]string name,ThreadParam tp,[MarshalAs(UnmanagedType.I1)]bool embed);
 [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate void DestroyEvent([MarshalAs(UnmanagedType.LPWStr)]string code,[MarshalAs(UnmanagedType.LPStr)]string name,ThreadParam tp);
 [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate void OutputEvent([MarshalAs(UnmanagedType.LPWStr)]string code,[MarshalAs(UnmanagedType.LPStr)]string name,ThreadParam tp,[MarshalAs(UnmanagedType.LPWStr)]string text);
 [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate void InfoEvent(int type,[MarshalAs(UnmanagedType.LPWStr)]string text);
 [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate void InsertEvent(uint pid,ulong address,[MarshalAs(UnmanagedType.LPWStr)]string code);
 [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate void EmbedEvent([MarshalAs(UnmanagedType.LPWStr)]string text,ThreadParam tp);
 [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate IntPtr QueryEvent([MarshalAs(UnmanagedType.LPWStr)]string text);
 [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate void GameEvent([MarshalAs(UnmanagedType.LPWStr)]string id,[MarshalAs(UnmanagedType.LPWStr)]string title,[MarshalAs(UnmanagedType.LPWStr)]string version);
 [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate void Start(ProcessEvent connected,ProcessEvent disconnected,CreateEvent create,DestroyEvent destroy,OutputEvent output,InfoEvent info,InsertEvent insert,EmbedEvent embed,QueryEvent query,GameEvent game);
 [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate void Settings(int delay,int codepage,int buffer,int history,[MarshalAs(UnmanagedType.I1)]bool pcHooks);
 [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate void ProcessCall(uint pid);
 [UnmanagedFunctionPointer(CallingConvention.Cdecl)] [return:MarshalAs(UnmanagedType.I1)] delegate bool NeedInject(uint pid);
 [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate void HistoryEvent([MarshalAs(UnmanagedType.LPWStr)]string text);
 [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate void QueryHistory(ThreadParam tp,[MarshalAs(UnmanagedType.I1)]bool latest,HistoryEvent callback);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr LoadLibraryEx(string path,IntPtr file,uint flags);
 [DllImport("kernel32.dll",CharSet=CharSet.Ansi)] static extern IntPtr GetProcAddress(IntPtr module,string name);
 [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr OpenProcess(uint access,bool inherit,uint pid);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool IsWow64Process(IntPtr process,out bool wow);
 [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
 static readonly object Gate=new object(),OutputGate=new object();static readonly JavaScriptSerializer Json=new JavaScriptSerializer();
 static readonly List<Delegate> Keep=new List<Delegate>();
 sealed class Candidate {public ThreadParam tp;public string name,code,sample="";}
 static readonly Dictionary<string,Candidate> Candidates=new Dictionary<string,Candidate>();
 static volatile bool Quit,Connected;static uint Pid;static string Selected="";static QueryHistory Query;
 static void Emit(object data){lock(OutputGate)Console.WriteLine(Json.Serialize(data));}
 static T Bind<T>(IntPtr module,string name){IntPtr fn=GetProcAddress(module,name);if(fn==IntPtr.Zero)throw new Exception("LunaHook 版本不兼容，缺少 "+name);return (T)(object)Marshal.GetDelegateForFunctionPointer(fn,typeof(T));}
 static void List(){lock(Gate){Emit(new{type="streams",streams=Candidates.Values.OrderByDescending(c=>c.tp.Key()==Selected).ThenByDescending(c=>c.sample.Length>0).Take(80).Select(c=>new{id=c.tp.Key(),name=c.name,code=c.code,sample=c.sample,selected=c.tp.Key()==Selected}).ToArray()});}}
 static void Source(Candidate c,string text,string origin){Emit(new{type="source",text=text,streamId=c.tp.Key(),sourceName=c.name,origin=origin});}
 static void Select(string id){Candidate c;lock(Gate){if(!Candidates.TryGetValue(id,out c))throw new Exception("文本流已经失效，请刷新后选择。");Selected=id;}List();Emit(new{type="status",connected=Connected,message="已选择文本流，等待游戏台词。"});HistoryEvent cb=text=>{if(!String.IsNullOrWhiteSpace(text)&&text.Length<=8000)Source(c,text,"history");};Query(c.tp,true,cb);GC.KeepAlive(cb);}
 static void OnOutput(string code,string name,ThreadParam tp,string text){if(tp.processId!=Pid||String.IsNullOrWhiteSpace(text))return;if(text.Length>8000)text=text.Substring(0,8000);lock(Gate){Candidate c;if(!Candidates.TryGetValue(tp.Key(),out c)){if(Candidates.Count>=500)return;c=new Candidate{tp=tp,name=name,code=code};Candidates[tp.Key()]=c;}c.sample=text.Length>160?text.Substring(0,160):text;
  bool japanese=System.Text.RegularExpressions.Regex.IsMatch(text,"[\\u3040-\\u30ff]");bool noise=System.Text.RegularExpressions.Regex.IsMatch(name??"","name|speaker|choice|select|ruby|Console|Clipboard|Menu",System.Text.RegularExpressions.RegexOptions.IgnoreCase);
  if(Selected==""&&japanese&&!noise)Select(tp.Key());if(tp.Key()==Selected)Source(c,text,"live");}}
 static void Input(){string line;try{while(!Quit&&(line=Console.ReadLine())!=null){if(line.Length>4096)continue;try{var d=Json.Deserialize<Dictionary<string,object>>(line);string type=Convert.ToString(d["type"]);if(type=="quit")break;if(type=="select")Select(Convert.ToString(d["id"]));else if(type=="rescan")List();}catch(Exception e){Emit(new{type="error",message=e.Message});}}}catch{}Quit=true;}
 static void Windows(){var result=new List<object>();foreach(var p in Process.GetProcesses()){using(p){try{if(p.Id==Process.GetCurrentProcess().Id||p.MainWindowHandle==IntPtr.Zero||p.HasExited)continue;result.Add(new{pid=p.Id,hwnd=p.MainWindowHandle.ToInt64().ToString(),name=p.ProcessName,started=p.StartTime.ToUniversalTime().Ticks.ToString(System.Globalization.CultureInfo.InvariantCulture),path=p.MainModule.FileName,title=p.MainWindowTitle});}catch{}}}Emit(new{type="targets",targets=result});}
 public static int Main(string[] args){Console.OutputEncoding=new UTF8Encoding(false);Console.InputEncoding=new UTF8Encoding(false);ProcessCall detach=null;bool started=false;try{
  if(args.Length==1&&args[0]=="--list"){Windows();return 0;}
  string root=Environment.GetEnvironmentVariable("GALSHELF_HOOK_ROOT");if(String.IsNullOrEmpty(root)||!Path.IsPathRooted(root)||root.StartsWith("\\\\"))throw new Exception("请选择本机 LunaHook 组件目录。");
  IntPtr module=LoadLibraryEx(Path.Combine(root,"LunaHost64.dll"),IntPtr.Zero,8);if(module==IntPtr.Zero)throw new Exception("LunaHost64.dll 无法加载，请检查组件及其依赖。");
  Start start=Bind<Start>(module,"Luna_Start");Settings settings=Bind<Settings>(module,"Luna_Settings");ProcessCall connect=Bind<ProcessCall>(module,"Luna_ConnectProcess");detach=Bind<ProcessCall>(module,"Luna_DetachProcess");NeedInject need=Bind<NeedInject>(module,"Luna_CheckIfNeedInject");Query=Bind<QueryHistory>(module,"Luna_QueryThreadHistory");
  if(args.Length==1&&args[0]=="--probe"){Emit(new{type="probe",available=true,readOnly=true});return 0;}
  if(args.Length!=4)throw new Exception("Expected bound game PID, window, process name and creation time.");Pid=UInt32.Parse(args[0]);HookTarget.Validate(Pid,args[1],args[2],args[3]);
  bool wow;IntPtr handle=OpenProcess(0x1000,false,Pid);if(handle==IntPtr.Zero)throw new Exception("无法查询游戏进程。");try{if(!IsWow64Process(handle,out wow))throw new Exception("无法查询游戏位数。");}finally{CloseHandle(handle);}string bit=Environment.Is64BitOperatingSystem&&!wow?"64":"32";
  ProcessEvent connected=pid=>{if(pid==Pid){Connected=true;Emit(new{type="status",connected=true,message="游戏已连接，请推进对话。"});}},disconnected=pid=>{if(pid==Pid){Connected=false;Quit=true;Emit(new{type="status",connected=false,message="游戏已退出，抓取已断开。"});}};
  CreateEvent create=(code,name,tp,embed)=>{if(tp.processId!=Pid)return;lock(Gate){if(Candidates.Count<500)Candidates[tp.Key()]=new Candidate{tp=tp,name=name,code=code};}};
  DestroyEvent destroy=(code,name,tp)=>{lock(Gate){Candidates.Remove(tp.Key());if(tp.Key()==Selected)Selected="";}};
  OutputEvent output=OnOutput;InfoEvent info=(type,text)=>{};InsertEvent insert=(pid,address,code)=>{};EmbedEvent embedCb=(text,tp)=>{};QueryEvent query=text=>IntPtr.Zero;GameEvent game=(id,title,version)=>{};
  Keep.AddRange(new Delegate[]{connected,disconnected,create,destroy,output,info,insert,embedCb,query,game});
  settings(180,932,8000,8000,true);start(connected,disconnected,create,destroy,output,info,insert,embedCb,query,game);started=true;connect(Pid);
  if(need(Pid)){string dll=Path.Combine(root,"LunaHook"+bit+".dll");var psi=new ProcessStartInfo(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"HookInjector"+bit+".exe"),Pid+" "+args[1]+" \""+args[2]+"\" "+args[3]+" \""+dll+"\""){UseShellExecute=false,CreateNoWindow=true,RedirectStandardError=true};using(var child=Process.Start(psi)){if(!child.WaitForExit(12000)){child.Kill();throw new Exception("游戏连接超时。");}if(child.ExitCode!=0)throw new Exception("游戏连接失败："+child.StandardError.ReadToEnd().Trim());}}
  new Thread(Input){IsBackground=true}.Start();DateTime until=DateTime.UtcNow.AddSeconds(18);while(!Quit){try{HookTarget.Validate(Pid,args[1],args[2],args[3]);}catch{if(!Connected)throw;Emit(new{type="status",connected=false,message="游戏已退出，抓取已断开。"});break;}if(!Connected&&DateTime.UtcNow>until)throw new Exception("未连接到游戏，请检查位数和运行权限。");List();Emit(new{type="heartbeat",connected=Connected});Thread.Sleep(1000);}return 0;
 }catch(Exception e){Emit(new{type="error",fatal=true,message=e.Message});return 1;}finally{if(started&&detach!=null)try{detach(Pid);}catch{}GC.KeepAlive(Keep);}}
}
