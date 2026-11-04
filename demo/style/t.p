def var i as int no-undo.
DO i = 1 TO 3:
  if i = 2 then do:
  message i.
  end.
end.



procedure p1:
  display i.
end.
