import time
from glob import glob

def find_ds18b20_path():
    devs = glob("/sys/bus/w1/devices/28-*")
    if not devs:
        raise RuntimeError("No DS18B20 sensor found.")
    return devs[0] + "/w1_slave"

def read_temp_c():
    path = find_ds18b20_path()
    with open(path, "r") as f:
        lines = f.readlines()
    if "YES" not in lines[0]:
        raise RuntimeError("Bad CRC – check wiring and resistor.")
    t_str = lines[1].split("t=")[-1]
    return float(t_str) / 1000.0

print("timestamp,temp_c")
while True:
    try:
        t = read_temp_c()
        ts = time.strftime("%Y-%m-%d %H:%M:%S")
        print(f"{ts},{t:.2f}")
        with open("temp_data.csv", "a") as f:
            f.write(f"{ts},{t:.2f}\n")
        time.sleep(1.5)
    except KeyboardInterrupt:
        break
    except Exception as e:
        print("Error:", e)
        time.sleep(1)
