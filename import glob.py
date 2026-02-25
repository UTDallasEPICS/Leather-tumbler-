import glob
import time

#Here we open  the  directory where the raw data is located
sensor_path = glob.glob('/sys/bus/w1/devices/28-*/w1_slave')[0]

#function basically opens the file in read mode and go to the second line to find the line wher
# the temp data is. here its located at where "t=" is at
#then we take the temperateue and convert to centigrade and fahrnheit
def read_temp():
    with open(sensor_path, 'r') as f:
        lines = f.readlines()
    raw_temp = lines[1].find('t=')
    Centigrade_temp = float(lines[1][raw_temp+2:]) / 1000.0
    Fahrenheit_temp = Centigrade_temp * 9/5 + 32
    return Centigrade_temp, Fahrenheit_temp

#prints the temp at delay of 1 second (prevents the py from overloading from the teperatur e readings from the sensor.)
while True:
    celsius, fahrenheit = read_temp()
    print(f"Temp: {celsius:.2f}C / {fahrenheit:.2f}F")
    time.sleep(1)