// Synthetic Forma demo geometry — NOT production CAD.
$fn = 48;
module chassis() {
  difference() {
    minkowski() { cube([620,420,145], center=true); sphere(r=10); }
    translate([0,0,6]) cube([594,394,135], center=true);
    translate([-311,90,10]) cube([30,34,22], center=true); // J12 service opening
  }
}
module wheel_mount(x,y) { translate([x,y,-58]) cylinder(h=18,r=32,center=true); }
chassis();
wheel_mount(-220,-210); wheel_mount(220,-210); wheel_mount(-220,210); wheel_mount(220,210);
