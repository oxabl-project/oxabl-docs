/* header */
using Progress.Lang.*.
using Acme.Util.*.
define variable gTotal as integer.
define variable cName as char no-undo.
define temp-table ttOrder no-undo field id as int.
define buffer bOrder for ttOrder.
// old code: message "x".
function addOne returns integer (input piValue as integer, input piOther as integer, input piThird as integer):
  return piValue + 1.
end function.
procedure runIt:
  define input parameter ipName as character no-undo.
  do:
    if gTotal eq 1 and cName = "a"
    or cName = "b" then
    message "x" + cName + "y" + "z".
  end.
  for each ttOrder where ttOrder.id > 0 no-lock:
    gTotal = gTotal + 1.
  end.
  run other.p.
end procedure.
