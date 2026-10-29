/** Default command documentation supplied in the MIDAS reference file. */
export const MIDAS_MCT_REFERENCE_HEADER = `*SECT-PSCVALUE    ; PSC Value, General Section, Composite PC, Composite General
; SECT=iSEC, TYPE, SNAME, [OFFSET], bSD, bWE, SHAPE, bBU, bEQ, SNAME2(PSC VAL)            ; 1st line
; SECT=iSEC, TYPE, SNAME, [OFFSET], bSD, bWE, bHUMBLY, SHAPE, bBU, bEQ, SNAME2(PSC VAL)   ; 1st line(Composite PC)
;      [STIFF1]                                                                  ; 2nd line
;      [STIFF2]                                                                  ; 3rd line
;      [STIFF3]                                                                  ; 4th line
;      HT, BT, T1, T2                                                            ; 5th line(PSC)
;      bSHEARCHK, [SCHK], [WT]                                                   ; 6th line(PSC)
;      SW, GN, CTC, Bc, Tc, Hh, EsEc, DsDc, Ps, Pc                               ; 7th line(COMPOSITE-PC)
;      OPOLY=X1, Y1, X2, Y2, ..., Xn, Yn                                         ; Outer Polygon(PLANE)
;      IPOLY=X1, Y1, X2, Y2, ..., Xn, Yn                                         ; Inner Polygon(PLANE)
;      ...
;      IPOLY=X1, Y1, X2, Y2, ..., Xn, Yn                                         ; Inner Polygon(PLANE)
;      VERTEX=X1, Y1, X2, Y2, ..., Xn, Yn                                        ; Vertex(General-LINE)
;      LINE=VI1, VJ1, dTHIK1, iALIGN1                                            ; Line(General-LINE)
;      ...
;      LINE=VIn, VJn, dTHIKn, iALIGNn                                            ; Line(General-LINE)
;      LOOP=COUNT1, LIX11, LIX12, ..., LIXn                                      ; Line(General-LINE)
;      ...
;      LOOP=COUNTn, LIXn1, LIXn2, ..., LIXnn                                     ; Line(General-LINE)
; SECT=iSEC, TYPE, SNAME, [OFFSET2], bSD, bWE, SHAPE, iyVAR, izVAR, bEQ          ; 1st line - TAPERED
; SECT=iSEC, TYPE, SNAME, [OFFSET2], bSD, bWE, bHUMBLY, SHAPE, iyVAR, izVAR, bEQ ; 1st line - TAPERED(Composite PC)
;      [STIFF1-I]                                                                ; 2nd line
;      [STIFF2-I]                                                                ; 3rd line
;      [STIFF3-I]                                                                ; 4th line
;      [STIFF1-J]                                                                ; 5th line
;      [STIFF2-J]                                                                ; 6th line
;      [STIFF3-J]                                                                ; 7th line
;      HT-I, BT-I, T1-I, T2-I, HT-J, BT-J, T1-J, T2-J                            ; 8th line(PSC)
;      bSHEARCHK, [SCHK-I], [WT-I], [SCHK-J], [WT-J]                             ; 9rd line(PSC)
;      OPOLY=bI, X1, Y1, X2, Y2, ..., Xn, Yn                                     ; Outer Polygon(PLANE)
;      IPOLY=bI, X1, Y1, X2, Y2, ..., Xn, Yn                                     ; Inner Polygon(PLANE)
;      ...
;      IPOLY=bI, X1, Y1, X2, Y2, ..., Xn, Yn                                     ; Inner Polygon(PLANE)
;      VERTEX=bI, X1, Y1, X2, Y2, ..., Xn, Yn                                    ; Vertex(General-LINE)
;      LINE=bI, VI1, VJ1, dTHIK1, iALIGN1                                        ; Line(General-LINE)
;      ...
;      LINE=bI, VIn, VJn, dTHIKn, iALIGNn                                        ; Line(General-LINE)
;      LOOP=bI, COUNT1, LIX11, LIX12, ..., LIXnn                                 ; Line(General-LINE)
;      ...
;      LOOP=bI, COUNTn, LIXn1, LIXn2, ..., LIXnn                                 ; Line(General-LINE)
; SECT=iSEC, TYPE, SNAME, [OFFSET], bSD, bWE, SHAPE, bBU, bEQ, BPRT              ; 1st line - COMPOSITE-GEN
;      [PART1]                                                                   ; 2nd line
;      [PART2]                                                                   ; 3rd line
;      ...
; SECT=iSEC, TYPE, SNAME, [OFFSET2], bSD, bWE, SHAPE, iyVAR, izVAR, bEQ, PARTNUM ; 1st line - COMPOSITE-GEN(TAPERED)
;      [PART1]-I                                                                 ; 2nd line
;      [PART2]-I                                                                 ; next lines
;      ...
;      [PART1]-J                                                                 ; next lines
;      [PART2]-J                                                                 ; next lines
;      ...
; [OFFSET] : OFFSET, iCENT, iREF, iHORZ, HUSER, iVERT, VUSER
; [OFFSET2]: OFFSET, iCENT, iREF, iHORZ, HUSERI, HUSERJ, iVERT, VUSERI, VUSERJ
; [STIFF1] : AREA, ASy, ASz, Ixx, Iyy, Izz
; [STIFF2] ; Cyp, Cym, Czp, Czm, Qyb, Qzb, PERI_OUT, PERI_IN, Cy, Cz
; [STIFF3] ; Y1, Y2, Y3, Y4, Z1, Z2, Z3, Z4
; [SCHK]   : Z1, Z3, bAUTO_QY1, QY1, bAUTO_QY2, QY2, bAUTO_QY3, QY3
; [WT]     : TOR, bAUTO_SHR1, SHR1, bAUTO_SHR2, SHR2, bAUTO_SHR3, SHR3
; [PART] : PART=part_num
;        : [STIFF1]
;        : [STIFF2]
;        : [STIFF3]
;        : [STIFF1]                                                            ; [STIFF1] of Part Sum.
;        : [STIFF2]                                                            ; [STIFF2] of Part Sum.
;        : [STIFF3]                                                            ; [STIFF3] of Part Sum.
;        : OPOLY=(bI-Tapered), X1, Y1, X2, Y2, ..., Xn, Yn                     ; Outer Polygon(PLANE)
;        : IPOLY=(bI-Tapered), X1, Y1, X2, Y2, ..., Xn, Yn                     ; Inner Polygon(PLANE)
;        : ...
;        : IPOLY=(bI-Tapered), X1, Y1, X2, Y2, ..., Xn, Yn                     ; Inner Polygon(PLANE)
;        : VERTEX=(bI-Tapered), X1, Y1, X2, Y2, ..., Xn, Yn                    ; Vertex(General-LINE)
;        : LINE=(bI-Tapered), VI1, VJ1, dTHIK1, iALIGN1                        ; Line(General-LINE)
;        : ...
;        : LINE=(bI-Tapered), VIn, VJn, dTHIKn, iALIGNn                        ; Line(General-LINE)
;        : LOOP=(bI-Tapered), COUNT1, LIX11, LIX12, ..., LIXn                  ; Line(General-LINE)
;        : ...
;        : LOOP=(bI-Tapered), COUNTn, LIXn1, LIXn2, ..., LIXnn                 ; Line(General-LINE)`;
