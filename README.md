# Beat Disc
A visualization of time offering the ability to mark its passage with eight sounds

The code is 100% html, css, javascript, and json.

Sounds are Base64 encoded and loaded into the sounds.js file.

Controls allow the user to 
* specify any postive integer to draw equidistant slices of the time
* speed up or slow down or stop the rotation
* export or import patterns as json files

# usage
Click on any of the eight concentric circles to add a mark. When the circle is rotating, the mark will make a sound as it passes the12 o'clock position.
Click on any existing mark to remove it.

Open the settings panel to control volume of each sound, alter the behavior of the disc when stopping, control the number of subdivisions, declare if marks can be place anywhere or only on the subdivisions, and export or import json files documenting a beat. External to the setting spanel there is a share function which will work with your operating system to generate a URL to a beat. 

If you wish to generate your own sounds, convert them to base64 and load them into the sounds.js file. Instructions are in the comments of the sounds.js file.

# current bugs
Let me know if you find any; it seems stable and performant on all platforms I've been able to test with.

# running version
<a href="https://beatdis.co">https://beatdis.co</a>

# patent
It seems somebody thought of this long ago and patented it. I had no idea when I wrote this code. https://patents.google.com/patent/US7589269B2/en
