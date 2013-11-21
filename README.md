POIThreeJS
==========

Integrating the FI-WARE MIWI Points Of Interest (POI) GE to the 3D UI.

Now the simplest first stab to get the functionality: fetch POI data from the server (hosted by CIE, responsible for the POI GE) & visualise it with the city scene which is the 3D UI part for the planned integrated MIWI use case.

One purpose of this development was to learn about concrete interplay of 3D UI and other GEs. There are some (preliminary) lessons learned and issues encountered, documented in the following (largely TODO still).

Known issues
===========

- mouse clicks can go through the 2d UI elements to the 3d UI. This is reportedly solved by Adminotech's 2DUI GE / input system. So the solution is to integrate with that somehow.

Live demo & installation
==================

Live demo: http://playsign.tklapp.com:8000/POIThreeJS/POI.html

Installation:

- clone this repo, access POI.html

To see the city in the background:

- clone the OuluThreeJS repo and put that directory inside this POIThreeJS directory -- that is: POIThreeJS assumes the OuluThreeJS directory to be inside it as a subdirectory and uses it as a library (we could set it up as a git submodule here perhaps to make the installation automated)
