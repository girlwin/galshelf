// Synthetic Japanese dialogue for capture integration tests. No game assets.
using System;
using System.Drawing;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using System.Windows.Forms;
public sealed class CaptureFixture : Form {
 [DllImport("gdi32.dll",CharSet=CharSet.Unicode)] static extern bool TextOutW(IntPtr dc,int x,int y,string text,int length);
 [DllImport("gdi32.dll",CharSet=CharSet.Unicode)] static extern bool ExtTextOutW(IntPtr dc,int x,int y,uint options,IntPtr rect,string text,uint length,IntPtr spacing);
 [DllImport("gdi32.dll")] static extern bool TextOutA(IntPtr dc,int x,int y,byte[] text,int length);
 readonly Timer timer=new Timer();int ticks;readonly string stopFile;
 readonly string[] lines={"今日は日本語を勉強します。","この物語を一緒に読みましょう。","明日もまた会いましょう。"};
 public CaptureFixture(string stop){stopFile=stop;Text="galshelf synthetic capture test";Width=720;Height=220;timer.Interval=1100;timer.Tick+=(s,e)=>{if(!String.IsNullOrEmpty(stopFile)&&System.IO.File.Exists(stopFile)){Close();return;}ticks++;Invalidate();};timer.Start();}
 [MethodImpl(MethodImplOptions.NoInlining)] static void Dialogue(IntPtr dc,string text){TextOutW(dc,20,35,text,text.Length);}
 [MethodImpl(MethodImplOptions.NoInlining)] static void Caption(IntPtr dc){byte[] text=System.Text.Encoding.GetEncoding(932).GetBytes("テスト用の別テキストです。");TextOutA(dc,20,85,text,text.Length);}
 protected override void OnPaint(PaintEventArgs e){base.OnPaint(e);IntPtr dc=e.Graphics.GetHdc();try{Dialogue(dc,lines[(ticks/3)%lines.Length]);Caption(dc);}finally{e.Graphics.ReleaseHdc(dc);}}
 [STAThread] public static void Main(string[] args){Application.EnableVisualStyles();Application.Run(new CaptureFixture(args.Length>0?args[0]:null));}
}
