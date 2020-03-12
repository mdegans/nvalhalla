#!/bin/bash
for f in *.dot; do
	dot -Tpdf "$f" > "${f%.dot}.pdf" 
done
rm *.dot
