/* post-order.p: post one order to the ledger */
{include/order-vars.i}

define variable iCount as integer no-undo.

iCount = 0.
for each order no-lock where order.order-num = piOrder:
    iCount = iCount + 1.
end.

if iCount = 0 then
    message "no order " piOrder view-as alert-box.
