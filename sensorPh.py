from adafruit_ads1x15.ads1115 import ADS1115
from adafruit_ads1x15.analog_in import AnalogIn
import board, busio

i2c = busio.I2C(board.SCL, board.SDA)
ads = ADS1115(i2c)
chan = AnalogIn(ads, ADS1115.P0)

while True:
    voltage = chan.voltage   # 0–3.3V
    pH = 7 + ((2.5 - voltage) / 0.18)   # depends on slope
    print("Voltage:", voltage, "pH:", pH)
