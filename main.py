from machine import Pin, PWM, time_pulse_us, ADC
from time import sleep, sleep_us, sleep_ms, time, localtime, gmtime
import onewire, ds18x20
import urequests, network, json


#Servo pins
servo_pin = Pin(0)
servo = PWM(servo_pin)

#Ultrasonic pins
trig = Pin(16, Pin.OUT)
echo = Pin(17, Pin.IN)

#temp pins
dat = machine.Pin(15)
ds = ds18x20.DS18X20(onewire.OneWire(dat))
roms = ds.scan()

#Soil moisture pins
soil_moisture_sensor = ADC(26)
ADC_MAX = 65535
V_REF = 3.3
a = 1.25
b = 0.45
V_MIN = 0.60
sensor_temp = ADC(4)
conversion_factor = 3.3 / 65535

#Relay pins
fan1 = Pin(2, Pin.OUT)
fan2 = Pin(4, Pin.OUT)
solenoid = Pin(3, Pin.OUT)

#Load cell pins
dt = Pin(12, Pin.IN)
sck = Pin(13, Pin.OUT)

#Flow meter pins
flow_sensor = Pin(1, Pin.IN)
pulse_count = 0

#Pump Pins
pump = PWM(Pin(5))
pump.freq(1000)

pulse_count = 0

#Fans URL
SERVER_URL = 'http://192.168.8.151:3000/toggle-led'


##############
# WIFI Config#
##############
SSID = 'Tayel'
PASSWORD = 'Stem@4040'

wlan = network.WLAN(network.STA_IF)
wlan.active(True)
wlan.connect(SSID, PASSWORD)

print('Connecting to the internet...')
while not wlan.isconnected():
    sleep(0.5)

print("WiFi connected")
#####################
# Functions section #
#####################
def runServo(angle):
    pulse_width = 500 + (angle / 180) * 1900
    duty_cycle = (pulse_width/20000)*100
    mapped_value = duty_cycle * (65535/100)
    servo.duty_u16(int(mapped_value))
    
def set_pump_speed(percent):
    percent = max(0, min(100, percent))  # clamp 0–100
    duty = int((percent / 100) * 65535)
    pump.duty_u16(duty)
def read_temp():
    reading = sensor_temp.read_u16() * conversion_factor
    temp = 27 - (reading - 0.706) / 0.001721
    return temp
def get_distance():
    trig.low()
    sleep_us(2)
    trig.high()
    sleep_us(10)
    trig.low()
    duration = time_pulse_us(echo, 1)
    T = read_temp()
    v = (331.4 + 0.606 * T) * 0.0001
    distance = (duration * v) / 2
    return distance

def get_moisture():
    raw = soil_moisture_sensor.read_u16()

    # Convert ADC → Voltage
    V = (raw / ADC_MAX) * V_REF

    # Prevent invalid region (important fix)
    if V < V_MIN:
        V = V_MIN

    # Calibrated model (stable form of your equation)
    theta_v = (a / V) - b

    # Normalize to physical range [0, 1]
    if theta_v > 1:
        theta_v = 1
    if theta_v < 0:
        theta_v = 0

    # Convert to percentage
    moisture_percent = theta_v * 100
    return moisture_percent

def get_temp():
    global roms
    for _ in range(3):  # retry 3 times
        try:
            ds.convert_temp()
            sleep_ms(750)
            temp = 1.001 * ds.read_temp(roms[0]) - 0.28
            return temp
        except Exception:
            pass
    return None  # if all retries fail
    
    
def get_load():
    while dt.value() == 1:
        pass
    
    data = 0
    for _ in range(24):
        sck.high()
        data = data << 1
        sck.low()
        if dt.value():
            data += 1
    
    sck.high()
    sck.low()
    
    if data & 0x800000:
        data -= 0x1000000
    
    return data
        
    
def get_flow():
    global pulse_count
    sleep(1)
    flow_rate = pulse_count / 83.3
    return flow_rate


def log_to_file(temp, moisture, distance, water_level):
    with open("log.csv", "a") as f:
        f.write("{},{},{},{},{}\n".format(
            time(), temp, moisture, distance, water_level
        ))
        

fanState = False
solenoidState = False
def get_state():
    global fanState
    global solenoidState
    response = urequests.get(SERVER_URL)
    data = response.json()
    response.close()
    fanState = data['fanState']
    solenoidState = data['solenoidState']
    print("FanState: ", fanState)
   
#############
# Main Code #
#############


last_send = 0
while True:
    get_state()
    distance = get_distance()
    water_level = 30 - distance
    moisture = get_moisture()
    temp = get_temp()

    print("TimeStamp", localtime())
    print("water level", water_level)
    print("Distance", distance, "cm")
    print("Temperature", temp, "°C")
    print("Soil Moisture", moisture, "%")

    # Control logic (unchanged)
    if (distance > 8) or (solenoidState == True):
        solenoid.low()
        solenoidState = True
    else:
        solenoid.high()
        solenoidState = False

    if (fanState == True) or (temp > 30):
        fan1.low()
        fan2.low()
        fanState = True
    else:
        fan1.high()
        fan2.high()
        fanState = False

    if moisture < 5 or temp > 30:
        set_pump_speed(100)
    elif 5 <= moisture <= 8:
        set_pump_speed(87.5)
    else:
        set_pump_speed(75)


    t = localtime()
    firebase_timestamp = time()
    timestamp = "{:04d}{:02d}{:02d}{:02d}{:02d}{:02d}".format(
        t[0], t[1], t[2], t[3], t[4], t[5]
        )


    t = gmtime(firebase_timestamp)

    iso_timestamp = "{:04d}-{:02d}-{:02d}T{:02d}:{:02d}:{:02d}Z".format(
        t[0], t[1], t[2], t[3], t[4], t[5]
    )
    url = f"https://firestore.googleapis.com/v1/projects/capstone-a52d4/databases/(default)/documents/sensorData?documentId={timestamp}"
    data = {
        "fields": {
            "Soil Moisture": {"doubleValue": moisture },
            "Water Level": {"doubleValue": water_level},
            "Temperature": {"doubleValue": temp},
            "fanState": {"booleanValue": fanState},
            "solenoidState":{"booleanValue": solenoidState},
            "timestamp": {"timestampValue": iso_timestamp}
        }
    }


    current_time = time()

    if current_time - last_send >= 5:   # ✅ every 5 sec
        last_send = current_time

        try:
            response = urequests.post(url, json=data)
            print(response.text)
            response.close()
        except Exception as e:
            print("POST failed:", e)
