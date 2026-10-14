Project NOAH flood hazard overlay for Barangay Pasong Buaya II, Imus, Cavite
==========================================================================

Files
  flood_100yr.png   Transparent overlay, about 3 m per pixel. Colours follow
                    Project NOAH's scheme for the 100-year rain return flood
                    hazard map:
                      yellow (250,204,21)  low hazard     up to 0.5 m
                      orange (249,115,22)  medium hazard  0.5 to 1.5 m
                      red    (220,38,38)   high hazard    over 1.5 m
                    Hazard level also reflects flow velocity, not only depth.
  flood_100yr.json  Geographic bounds of the image (WGS 84) and its source.

Source
  Project NOAH (UP NOAH Center) 100-year rain return flood hazard maps,
  produced with PAGASA rainfall data and Flo-2D GDS Pro modelling.
  Taken from the "flood_100yr" PMTiles layer (zoom 14) published by
  BetterGov.ph (data.bettergov.ph / huggingface.co/datasets/bettergovph/
  project-noah-hazard-maps), cropped to the barangay plus a 25% margin and
  rendered to an image by the PB2Link project.

Licence
  Contains data from Project NOAH and its contributors, licensed under the
  Open Data Commons Open Database License (ODbL) 1.0:
  https://opendatacommons.org/licenses/odbl/1.0/
  This derived overlay is distributed under the same licence.

Use
  A planning aid showing where flooding is likely in a very heavy (100-year)
  rainfall event. It is not a live flood report. Always follow barangay
  advisories and PAGASA / NDRRMC warnings.
