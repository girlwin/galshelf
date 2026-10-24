using System;
using System.IO;
using System.Threading;
class TestGame {
  static void Main(string[] args) {
    if(args.Length>0) File.WriteAllLines(args[0], args);
    Thread.Sleep(1800);
  }
}
