' Paste this code into a DataAnalysis method script; do not run with Windows Script Host.
' Uses the same chromatogram/line-spectrum export as the lab method.
' Keeps segment-time decimals instead of truncating them with Int().
Option Explicit

Dim MyChrom, MySeg, SegNo, fso, tf, fn

Analysis.RecalculateLineSpectra
Set MyChrom = Analysis.Chromatograms(1)
fn = Analysis.Path + "\data.ascii"
MyChrom.Export fn, daASCII, daLine

Set fso = CreateObject("Scripting.FileSystemObject")
Set tf = fso.CreateTextFile(Analysis.Path + "\Segments.txt", True)
tf.WriteLine CStr(MyChrom.Size)
SegNo = 0
For Each MySeg In Analysis.Segments
    SegNo = SegNo + 1
    tf.WriteLine CStr(SegNo) + " " + _
        Replace(CStr(MySeg.RetentionTimeStart), ",", ".") + " " + _
        Replace(CStr(MySeg.RetentionTimeEnd), ",", ".")
Next
tf.Close
