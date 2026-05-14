# Nitrogonia
This website is for Nitrogonia, which is an aquaponics system (A system that combines agriculture with aquaculture). The project uses a Raspberry pi pico W to control the feedback system in the project.
<hr>

### Purpose of the website
The website was made to monitor the sensor reading where it offers a real time visualization for the sensors' readings. Also, it offers the ability to control actuators in the system like the fans and the valves.

<hr>

### Tech Used
- Micropython to code the the rpi pico w
- Node js/express for the backend code
- EJS for the frontned
- Firebase to store the readings of the sensors

<hr>

### Projfect Structure
- The "main.py" contains the code for the rpi pico w.
- The api directory contains the logic for the backend of the system, where it connets to the rpi pico, fetches the readings from firebase, and renders the views for the frontend.



The system is turned off now so the graphs will not be updated. U can check that the raspberry pi actually is connected to the website by checking the code.
