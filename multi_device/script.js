const REPORT_COUNT = 32;

const connectButton = document.querySelector("#connect");
const soundButton = document.querySelector("#sound");
const automodeRadio = document.querySelector("#automode");
const gainSlider = document.querySelector("#gain");

let handshake_timeout;
let automodeTimerId;
const keyboards = [];

const colorPicker = new iro.ColorPicker("#picker");

function hsvFromPicker(hsv) {
  return { h: (hsv.h / 360) * 255, s: (hsv.s / 100) * 255, v: (hsv.v / 100) * 255 };
}

function hsvToPicker(hsv) {
  return {
    h: (hsv.h / 255) * 360,
    s: (hsv.s / 255) * 100,
    v: (hsv.v / 255) * 100,
  };
}

function automode(mode, timerId) {
  if (timerId) clearInterval(timerId);
  timerId = undefined;

  if (mode == "Off") return timerId;

  timerId = setInterval(() => {
    hsv = hsvFromPicker(colorPicker.color.hsv);
    hsv[mode.toLowerCase()]++;
    if (hsv[mode.toLowerCase()] > 255) hsv[mode.toLowerCase()] = 0;
    colorPicker.color.hsv = hsvToPicker(hsv);
  }, 1);

  return timerId;
}

async function handshakeHandler(e) {
  let response = "";
  for (let i = 1; i < 4; i++) {
    response += String.fromCharCode(e.data.getUint8(i));
  }
  if (e.data.getUint8(0) == 1 && response == "RGB") {
    // Successful handshake

    clearTimeout(handshake_timeout);
    console.log("Successful handshake");
    e.device.removeEventListener("inputreport", handshakeHandler);
    keyboards.push(e.device);
    connectButton.disabled = null;
  } else {
    console.log("Wrong handshake command");
    connectButton.disabled = null;
    e.device.close();
    console.log(e);
  }
}

connectButton.addEventListener("click", async () => {
  try {
    const devices = await navigator.hid.requestDevice({
      filters: [{ usagePage: 0xff60, usage: 0x61 }],
    });
    const device = devices[0];
    if (!device) {
      console.log("Device is not selected");
    } else {
      if (device.opened) await device.close();
      await device.open();
      device.addEventListener("inputreport", handshakeHandler);

      document.querySelector("#connect").disabled = "disabled";

      // send handshake
      handshake_timeout = setTimeout(() => {
        console.error("Handshake timeout");
        connectButton.disabled = null;
        device.close();
      }, 1000);
      const data = new Uint8Array(REPORT_COUNT);
      data[0] = 0;
      await device.sendReport(0x00, data);
    }
  } catch (error) {
    console.error(error);
  }
});

soundButton.addEventListener("click", async () => {
  soundButton.disabled = "disabled";
  try {
    const audioContext = new AudioContext();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();

    source.connect(analyser);

    await audioContext.resume();

    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    function updateVisualization() {
      analyser.getByteFrequencyData(dataArray);
      analyser.minDecibels = -90;
      analyser.maxDecibels = -10;
      analyser.smoothingTimeConstant = 0.2;

      const topFrequency = 1000;

      const volume =
        (dataArray.slice(0, topFrequency).reduce((acc, val) => acc + val, 0) / topFrequency) *
        gainSlider.value;

      colorPicker.color.value = volume > 100 ? 100 : volume;
      requestAnimationFrame(updateVisualization);
    }

    updateVisualization();
  } catch (error) {
    soundButton.disabled = null;
    console.error("Error setting up audio:", error);
  }
});

colorPicker.on("color:change", async (color) => {
  if (keyboards.length == 0) return;
  const data = new Uint8Array(REPORT_COUNT);
  const hsv = hsvFromPicker(color.hsv);
  data[0] = 1;
  data[1] = hsv.h;
  data[2] = hsv.s;
  data[3] = hsv.v;
  for (const device of keyboards) {
    try {
      if (device.opened) {
        await device.sendReport(0x00, data);
      }
    } catch (error) {
      console.error(error);
    }
  }
});

automodeRadio.addEventListener("change", (e) => {
  automodeTimerId = automode(e.currentTarget.elements["automode"].value, automodeTimerId);
});

navigator.hid.addEventListener("disconnect", ({ device }) => {
  console.log("Disconnected");
  if (e.device.opened) e.device.close();
});

colorPicker.color.saturation = 100;
automodeTimerId = automode(automodeRadio.elements["automode"].value, automodeTimerId);
