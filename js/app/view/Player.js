define(['app/view/Waveform', 'underscore', 'backbone'], function (Waveform, _, Backbone) {
    return Backbone.View.extend({
        className: 'player',

        trackTemplate: _.template('<a href="<%-backLink%>"><%-trackName%></a>'),

        template: _.template(
            '<div class="plate">' +
                '<div class="ring"><div class="ring"><div class="ring">' +
                '<div class="logo"> ___<br/>{o,o}<br/>|)__)<br/>-"-"-</div>' +
                '</div></div></div>' +
                '</div>' +
                '<span class="pitch">Pitch</span>' +
                '<input type="range" min="20" max="45" value="33" step="0.1">' +
                '<div class="trackName"></div>' +
                '<div class="artist"></div>' +
                '<span class="play">&#9654;</span>'
        ),

        rpm: 33,
        lastTime: null,
        rotation: 0,

        events: {
            'change input[type="range"]': 'setSpeed',
            'click .play': 'togglePlayback'
        },

        initialize: function (options) {
            this.lastTime = new Date();
            this.track = options.track;
            this.track.on('play', function () {
                this.lastTime = null;
            }, this);
            this.track.on('load', function () {
                this.$el.removeClass('disabled');
                this.waveform.updatePosition();
            }, this);
            this.waveform = new Waveform({track: this.track});
        },

        render: function () {
            this.$el.append(this.template());
            this.$el.prepend(this.waveform.render().el);
            this.speedSlider = this.$el.find('input[type="range"]');
            this.speedSlider.val(this.rpm);
            return this;
        },

        setSpeed: function () {
            this.rpm = parseFloat(this.speedSlider.val());
            this.track.setPlaybackRate(this.rpm/33);
        },

        update: function (now) {
            if (!this.track.isPlaying()) return;
            if (!this.lastTime) {
                this.lastTime = now;
                return;
            }
            this.rotation += this.rpm * 2 * Math.PI * (now - this.lastTime) / 60000;
            this.lastTime = now;
            var plate = this.$el.find('.plate');
            plate.css('-webkit-transform', 'rotate(' + this.rotation + 'rad)');

            this.waveform.updatePosition();
        },

        loadTrackFromUrl: function (url, artist, trackName, backLink) {
            this.track.loadFromUrl(url);
            this.$el.find('.trackName').html(this.trackTemplate({
                trackName: trackName,
                backLink: backLink
            }));
            this.$el.find('.artist').text(artist);
            this.$el.addClass('disabled');
        },

        loadTrackFromFile: function (file) {
            this.track.loadFromFile(file);
            this.$el.find('.trackName').html(this.trackTemplate({
                trackName: file.name,
                backLink: ''
            }));
            this.$el.find('.artist').text('');
            this.$el.addClass('disabled');
        },

        togglePlayback: function () {
            if (this.track.isPlaying()) {
                this.track.stop();
            } else if (!this.track.wasPlaying()) {
                this.track.start();
                this.setSpeed();
            } else {
                this.track.resume();
                this.setSpeed();
            }
        }
    });
});