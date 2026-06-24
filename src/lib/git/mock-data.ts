export const mockKiCadPcbRevA = `(kicad_pcb (version 20211014) (generator pcbnew)
  (layers
    (0 "F.Cu" signal)
    (31 "B.Cu" signal)
    (37 "F.SilkS" user)
    (40 "Edge.Cuts" user)
  )
  (footprint "Resistor_SMD:R_0805_2012Metric" (layer "F.Cu") (at 10 20)
    (fp_text reference "R1" (at 0 -2) (layer "F.SilkS"))
    (fp_text value "10k" (at 0 2) (layer "F.SilkS"))
    (pad "1" smd roundrect (at -0.95 0) (size 1.2 1.3) (layers "F.Cu") (net 1))
    (pad "2" smd roundrect (at 0.95 0) (size 1.2 1.3) (layers "F.Cu") (net 2))
  )
  (footprint "Resistor_SMD:R_0805_2012Metric" (layer "F.Cu") (at 20 20)
    (fp_text reference "R2" (at 0 -2) (layer "F.SilkS"))
    (fp_text value "220" (at 0 2) (layer "F.SilkS"))
    (pad "1" smd roundrect (at -0.95 0) (size 1.2 1.3) (layers "F.Cu") (net 2))
    (pad "2" smd roundrect (at 0.95 0) (size 1.2 1.3) (layers "F.Cu") (net 3))
  )
  (footprint "Resistor_SMD:R_0805_2012Metric" (layer "F.Cu") (at 50 20)
    (fp_text reference "R4" (at 0 -2) (layer "F.SilkS"))
    (fp_text value "100" (at 0 2) (layer "F.SilkS"))
    (pad "1" smd roundrect (at -0.95 0) (size 1.2 1.3) (layers "F.Cu") (net 4))
    (pad "2" smd roundrect (at 0.95 0) (size 1.2 1.3) (layers "F.Cu") (net 5))
  )
  (segment (start 10.95 20) (end 19.05 20) (width 0.25) (layer "F.Cu") (net 2))
  (segment (start 20.95 20) (end 49.05 20) (width 0.25) (layer "F.Cu") (net 4))
)`;

export const mockKiCadPcbRevB = `(kicad_pcb (version 20211014) (generator pcbnew)
  (layers
    (0 "F.Cu" signal)
    (31 "B.Cu" signal)
    (37 "F.SilkS" user)
    (40 "Edge.Cuts" user)
  )
  (footprint "Resistor_SMD:R_0805_2012Metric" (layer "F.Cu") (at 12 20)
    (fp_text reference "R1" (at 0 -2) (layer "F.SilkS"))
    (fp_text value "10k" (at 0 2) (layer "F.SilkS"))
    (pad "1" smd roundrect (at -0.95 0) (size 1.2 1.3) (layers "F.Cu") (net 1))
    (pad "2" smd roundrect (at 0.95 0) (size 1.2 1.3) (layers "F.Cu") (net 2))
  )
  (footprint "Resistor_SMD:R_0805_2012Metric" (layer "F.Cu") (at 20 20)
    (fp_text reference "R2" (at 0 -2) (layer "F.SilkS"))
    (fp_text value "220" (at 0 2) (layer "F.SilkS"))
    (pad "1" smd roundrect (at -0.95 0) (size 1.2 1.3) (layers "F.Cu") (net 2))
    (pad "2" smd roundrect (at 0.95 0) (size 1.2 1.3) (layers "F.Cu") (net 3))
  )
  (footprint "Resistor_SMD:R_0805_2012Metric" (layer "F.Cu") (at 35 20)
    (fp_text reference "R3" (at 0 -2) (layer "F.SilkS"))
    (fp_text value "470" (at 0 2) (layer "F.SilkS"))
    (pad "1" smd roundrect (at -0.95 0) (size 1.2 1.3) (layers "F.Cu") (net 3))
    (pad "2" smd roundrect (at 0.95 0) (size 1.2 1.3) (layers "F.Cu") (net 6))
  )
  (segment (start 12.95 20) (end 19.05 20) (width 0.25) (layer "F.Cu") (net 2))
  (segment (start 20.95 20) (end 34.05 20) (width 0.25) (layer "F.Cu") (net 3))
)`;

export const mockKiCadSchRevA = `(kicad_sch (version 20211014) (generator eeschema)
  (symbol (lib_id "Device:R") (at 50 50)
    (property "Reference" "R1")
    (property "Value" "10k")
    (pin "1" (at 44.92 50))
    (pin "2" (at 55.08 50))
  )
  (symbol (lib_id "Device:R") (at 70 50)
    (property "Reference" "R2")
    (property "Value" "220")
    (pin "1" (at 64.92 50))
    (pin "2" (at 75.08 50))
  )
  (wire (pts (xy 55.08 50) (xy 64.92 50)))
)`;

export const mockKiCadSchRevB = `(kicad_sch (version 20211014) (generator eeschema)
  (symbol (lib_id "Device:R") (at 55 50)
    (property "Reference" "R1")
    (property "Value" "10k")
    (pin "1" (at 49.92 50))
    (pin "2" (at 60.08 50))
  )
  (symbol (lib_id "Device:R") (at 70 50)
    (property "Reference" "R2")
    (property "Value" "220")
    (pin "1" (at 64.92 50))
    (pin "2" (at 75.08 50))
  )
  (symbol (lib_id "Device:C") (at 90 50)
    (property "Reference" "C1")
    (property "Value" "0.1uF")
    (pin "1" (at 87.46 50))
    (pin "2" (at 92.54 50))
  )
  (wire (pts (xy 60.08 50) (xy 64.92 50)))
  (wire (pts (xy 75.08 50) (xy 87.46 50)))
)`;

export const mockEagleBrdRevA = `<?xml version="1.0" encoding="utf-8"?>
<eagle version="9.6.2">
  <drawing>
    <board>
      <libraries>
        <library name="resistor">
          <packages>
            <package name="R0805">
              <smd name="1" x="-1.0" y="0" dx="1.0" dy="1.2" layer="1"/>
              <smd name="2" x="1.0" y="0" dx="1.0" dy="1.2" layer="1"/>
            </package>
          </packages>
        </library>
      </libraries>
      <elements>
        <element name="R1" library="resistor" package="R0805" value="10k" x="10" y="20"/>
        <element name="R2" library="resistor" package="R0805" value="220" x="20" y="20"/>
      </elements>
      <signals>
        <signal name="GND">
          <wire x1="11" y1="20" x2="19" y2="20" width="0.25" layer="1"/>
        </signal>
      </signals>
    </board>
  </drawing>
</eagle>`;

export const mockEagleBrdRevB = `<?xml version="1.0" encoding="utf-8"?>
<eagle version="9.6.2">
  <drawing>
    <board>
      <libraries>
        <library name="resistor">
          <packages>
            <package name="R0805">
              <smd name="1" x="-1.0" y="0" dx="1.0" dy="1.2" layer="1"/>
              <smd name="2" x="1.0" y="0" dx="1.0" dy="1.2" layer="1"/>
            </package>
          </packages>
        </library>
      </libraries>
      <elements>
        <element name="R1" library="resistor" package="R0805" value="10k" x="12" y="20"/>
        <element name="R2" library="resistor" package="R0805" value="220" x="20" y="20"/>
        <element name="R3" library="resistor" package="R0805" value="470" x="30" y="20"/>
      </elements>
      <signals>
        <signal name="GND">
          <wire x1="13" y1="20" x2="19" y2="20" width="0.25" layer="1"/>
        </signal>
        <signal name="VCC">
          <wire x1="21" y1="20" x2="29" y2="20" width="0.25" layer="1"/>
        </signal>
      </signals>
    </board>
  </drawing>
</eagle>`;
