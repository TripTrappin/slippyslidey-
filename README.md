# Slippy Slidey

A mobile-first endless sliding game prototype. Hit perfect-timed taps as you cross gates to keep your momentum up — let it drop and you wipe out.

## Run it

It's a static page — open `index.html` in a browser. For mobile testing on the same Wi-Fi:

```sh
# any static server works, for example:
python3 -m http.server 8000
# then visit http://<your-LAN-ip>:8000 on your phone
```

## Controls

- **Drag** left/right to steer the slider.
- **Tap** when crossing a gate. Tapping in the green band = `PERFECT`, yellow = `GOOD`, miss = momentum loss.

## Files

- `index.html` — markup and HUD
- `style.css` — layout, HUD, overlay
- `game.js` — game loop, gates, momentum, rendering (HTML5 Canvas)
