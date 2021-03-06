define(['app/misc/context', 'app/audio/Filter', 'underscore', 'backbone'], function (context, Filter, _, Backbone) {
    /**
     * Abstraction for loading and playing audio through the Web Audio API
     * @class app.Track
     * @constructor
     */
    function Track() {
        _.extend(this, Backbone.Events);

        this.source = null;
        this.currentRequest = null;
        this.fileReader = null;
        this.buffer = null;
        this.bufferPosition = null;
        this.filter = new Filter();
        this.gainNode = context.createGain();
        this.filter.getNode().connect(this.gainNode);
        this.gainNode.connect(context.destination);
        this.playbackSpeedModifier = 1;
    }

    /**
     * Load music into a buffer.
     * @param url {string}
     */
    Track.prototype.loadFromUrl = function (url) {
        var self = this,
            request = this.currentRequest = new XMLHttpRequest();

        this._abortLoad();

        request.open("GET", url, true);
        request.responseType = "arraybuffer";
        request.onload = function() {
            context.decodeAudioData( request.response, function(buffer) {
                self.currentRequest = null;
                self.buffer = buffer;
                self.reversedBuffer = self._reverseBuffer(buffer);
                self.trigger('load');
            });
        };
        request.send();
    };

    /**
     * Load music into a buffer.
     * @param file {File}
     */
    Track.prototype.loadFromFile = function (file) {
        var self = this,
            fileReader = this.fileReader = new FileReader();

        this._abortLoad();

        fileReader.onload = function(event) {
            context.decodeAudioData( event.target.result, function(buffer) {
                self.fileReader = null;
                self.buffer = buffer;
                self.reversedBuffer = self._reverseBuffer(buffer);
                self.trigger('load');
            });
        };
        fileReader.readAsArrayBuffer(file);
    };

    Track.prototype._abortLoad = function () {

        if (this.fileReader) {
            this.fileReader.abort();
            this.fileReader = null;
        }
        if (this.currentRequest) {
            this.currentRequest.abort();
            this.currentRequest = null;
        }

        this.stop();
        this.source = null;
        this.buffer = null;
        this.bufferPosition = null;
        this.playbackSpeedModifier = 1;
    };

    /**
     * Create a new source for playback and connect it to the sink (filter->gain->destination).
     *
     * Ramps up playback to given speed within one second.
     */
    Track.prototype.start = function () {
        if (this.isPlaying()) {
            throw new Error('Can only play a track that is not currently playing');
        }
        if (this.buffer) {
            this.bufferPosition = {
                position: 0,
                globalTime: context.currentTime
            };
            this._setupSourceAndPlay();
        }
    };

    /**
     * Resume the current track from the last known position.
     */
    Track.prototype.resume = function () {
        if (this.isPlaying()) {
            throw new Error('Can only resume a track that is not currently playing');
        }
        if (!this.buffer || !this.bufferPosition) {
            throw new Error('Can only resume a track that has been played before');
        }
        this.bufferPosition.globalTime = context.currentTime;
        this._setupSourceAndPlay();
    };

    Track.prototype._setupSourceAndPlay = function () {
        var now = context.currentTime;
        this.source = context.createBufferSource();
        this.source.connect(this.filter.getNode());
        var forwardPlayback = this.playbackSpeedModifier >= 0;
        this.source.buffer = forwardPlayback ? this.buffer : this.reversedBuffer;
        this.source.start(now, forwardPlayback ? this.bufferPosition.position :
            this.buffer.duration - this.bufferPosition.position);
        this.trigger('play');
    };

    Track.prototype._reverseBuffer = function (buffer) {
        var length = buffer.length,
            reversedBuffer = context.createBuffer(buffer.numberOfChannels, length, buffer.sampleRate),
            origChannelData,
            reversedChannelData;

        for (var i = 0; i < buffer.numberOfChannels; i++) {
            origChannelData = buffer.getChannelData(i);
            reversedChannelData = reversedBuffer.getChannelData(i);
            for (var j = 0; j < length; j++) {
                reversedChannelData[length - j - 1] = origChannelData[j];
            }
        }
        return reversedBuffer;
    };

    /**
     * Stop playback and disconnect the buffered source.
     */
    Track.prototype.stop = function () {
        if (this.isPlaying()) {
            this.trigger('stop');
            this.source.stop(0);
            this.source.disconnect(0);
            this.source = null;
        }
    };

    /**
     * Check for playback.
     * @returns {boolean}
     */
    Track.prototype.isPlaying = function () {
        return !!this.source;
    };

    /**
     * Checks if track was playing before.
     * @returns {boolean}
     */
    Track.prototype.wasPlaying = function () {
        return !!this.bufferPosition;
    };

    /**
     * Set the playback rate. A rate of 1 is normal playback.
     * @param rate {number}
     */
    Track.prototype.setPlaybackRate = function (rate) {
        if (this.isPlaying()) {
            this.setPlaybackModifier(rate);
        }
    };

    /**
     * Set the playback rate. A rate of 1 is normal playback.
     * @param modifier {number}
     */
    Track.prototype.setPlaybackModifier = function (modifier) {
        this.updateBufferPosition();
        var lastModifier = this.playbackSpeedModifier;
        if (modifier === 0) {
            modifier = 0.0001;
        }
        this.playbackSpeedModifier = modifier;
        if (lastModifier < 0 && modifier >= 0 || lastModifier >= 0 && modifier < 0) {
            this.stop();
            this.resume();
        }
        var number = Math.abs(modifier);
        this.source.playbackRate.setValueAtTime(number, context.currentTime);
    };

    /**
     * Set the gain. A gain of 1 is normal volume.
     * @param gain {number}
     */
    Track.prototype.setGain = function (gain) {
        this.gainNode.gain.value = gain;
    };

    /**
     * Get the Filter associated to this Track.
     * @returns {app.Filter}
     */
    Track.prototype.getFilter = function () {
        return this.filter;
    };

    /**
     * Current playback position in the track, whereas 0 is the start and 1 is the end.
     * @returns {number}
     */
    Track.prototype.currentPosition = function () {
        if (this.bufferPosition === null || !this.buffer) {
            return 0;
        }
        this.updateBufferPosition();
        return Math.min(this.bufferPosition.position / this.buffer.duration, 1);
    };

    /**
     * updates the current playback position in the buffer.
     */
    Track.prototype.updateBufferPosition = function () {
        if (!this.bufferPosition) {return;}
        this.bufferPosition = {
            position: this.bufferPosition.position +
                (context.currentTime - this.bufferPosition.globalTime) *
                this.playbackSpeedModifier,
            globalTime: context.currentTime
        };
    };

    return Track;
});