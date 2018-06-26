// Older browsers might not implement mediaDevices at all, so we set an empty object first
if (navigator.mediaDevices === undefined) {
  navigator.mediaDevices = {};
}


// Some browsers partially implement mediaDevices. We can't just assign an object
// with getUserMedia as it would overwrite existing properties.
// Here, we will just add the getUserMedia property if it's missing.
if (navigator.mediaDevices.getUserMedia === undefined) {
  navigator.mediaDevices.getUserMedia = function(constraints) {

    // First get ahold of the legacy getUserMedia, if present
    var getUserMedia = navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia;

    // Some browsers just don't implement it - return a rejected promise with an error
    // to keep a consistent interface
    if (!getUserMedia) {
      return Promise.reject(new Error('getUserMedia is not implemented in this browser'));
    }

    // Otherwise, wrap the call to the old navigator.getUserMedia with a Promise
    return new Promise(function(resolve, reject) {
      getUserMedia.call(navigator, constraints, resolve, reject);
    });
  }
}

// set up forked web audio context, for multiple browsers
// window. is needed otherwise Safari explodes

var audioCtx = new (window.AudioContext || window.webkitAudioContext)();
var source;
var stream;

//set up the different audio nodes we will use for the app

var analyser = audioCtx.createAnalyser();
analyser.minDecibels = -90;
analyser.maxDecibels = -10;
analyser.smoothingTimeConstant = 0.85;

var distortion = audioCtx.createWaveShaper();
var gainNode = audioCtx.createGain();
var biquadFilter = audioCtx.createBiquadFilter();
var convolver = audioCtx.createConvolver();

// distortion curve for the waveshaper, thanks to Kevin Ennis
// http://stackoverflow.com/questions/22312841/waveshaper-node-in-webaudio-how-to-emulate-distortion

function makeDistortionCurve(amount) {
  var k = typeof amount === 'number' ? amount : 50,
    n_samples = 44100,
    curve = new Float32Array(n_samples),
    deg = Math.PI / 180,
    i = 0,
    x;
  for ( ; i < n_samples; ++i ) {
    x = i * 2 / n_samples - 1;
    curve[i] = ( 3 + k ) * x * 20 * deg / ( Math.PI + k * Math.abs(x) );
  }
  return curve;
};

// grab audio track via XHR for convolver node

var soundSource, concertHallBuffer;

ajaxRequest = new XMLHttpRequest();

ajaxRequest.open('GET', 'https://mdn.github.io/voice-change-o-matic/audio/concert-crowd.ogg', true);

ajaxRequest.responseType = 'arraybuffer';

ajaxRequest.onload = function() {
  var audioData = ajaxRequest.response;

  audioCtx.decodeAudioData(audioData, function(buffer) {
      concertHallBuffer = buffer;
      soundSource = audioCtx.createBufferSource();
      soundSource.buffer = concertHallBuffer;
    }, function(e){ console.log("Error with decoding audio data" + e.err);});

  //soundSource.connect(audioCtx.destination);
  //soundSource.loop = true;
  //soundSource.start();
};

ajaxRequest.send();

// set up canvas context for visualizer


//main block for doing the audio recording

if (navigator.mediaDevices.getUserMedia) {
   console.log('getUserMedia supported.');
   var constraints = {audio: true}
   navigator.mediaDevices.getUserMedia (constraints)
      .then(
        function(stream) {
           source = audioCtx.createMediaStreamSource(stream);
           source.connect(analyser);
           analyser.connect(distortion);
           distortion.connect(biquadFilter);
           biquadFilter.connect(convolver);
           convolver.connect(gainNode);
           gainNode.connect(audioCtx.destination);

           voiceChange();
      })
      .catch( function(err) { console.log('The following gUM error occured: ' + err);})
} else {
   console.log('getUserMedia not supported on your browser!');
}

function freqAvg() {

    analyser.fftSize = 256;
    var bufferLength = analyser.frequencyBinCount;
    console.log(bufferLength);
    var dataArray = new Uint8Array(bufferLength);

    analyser.getByteFrequencyData(dataArray);

	var sum = 0;

    for(var i = 0; i < bufferLength; i++) {
    	sum += dataArray[i];
    }

    var avg = sum / bufferLength;
    console.log(avg);
}


function voiceChange() {

  distortion.oversample = '4x';
  biquadFilter.gain.setTargetAtTime(0, audioCtx.currentTime, 0)
  convolver.buffer = undefined;

  var voiceSetting = "convolver";
  console.log(voiceSetting);

  if(voiceSetting == "distortion") {
    distortion.curve = makeDistortionCurve(400);
  } else if(voiceSetting == "convolver") {
    convolver.buffer = concertHallBuffer;
  } else if(voiceSetting == "biquad") {
    biquadFilter.type = "lowshelf";
    biquadFilter.frequency.setTargetAtTime(1000, audioCtx.currentTime, 0)
    biquadFilter.gain.setTargetAtTime(25, audioCtx.currentTime, 0)
  } else if(voiceSetting == "off") {
    console.log("Voice settings turned off");
  }

}

// event listeners to change visualize and voice settings

visualSelect.onchange = function() {
  window.cancelAnimationFrame(drawVisual);
  visualize();
};

voiceSelect.onchange = function() {
  voiceChange();
};


mute.onclick = voiceMute;

function voiceMute() {
  if(mute.id === "") {
    gainNode.gain.setTargetAtTime(0, audioCtx.currentTime, 0)
    mute.id = "activated";
    mute.innerHTML = "Unmute";
  } else {
    gainNode.gain.setTargetAtTime(1, audioCtx.currentTime, 0)
    mute.id = "";
    mute.innerHTML = "Mute";
  }
}
