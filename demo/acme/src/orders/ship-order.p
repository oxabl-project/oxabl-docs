define variable cProgram as character no-undo initial "orders/notify.p".
define variable iShipped as integer.

find first order where order.order-num = 1.
iShipped = order.cust-num.
run value(cProgram).
display iShipped.
