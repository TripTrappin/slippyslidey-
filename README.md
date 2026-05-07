# Slippy Slidey

A mobile-first endless sliding game prototype. Side-view: roll down hills, launch off the peaks, and tap-and-hold in the air to dive. Land tangent to the next downslope for a `PERFECT` and carry your momentum forward.

## Run it

It's a static page — open `index.html` in a browser. For mobile testing on the same Wi-Fi:

```sh
# any static server works, for example:
python3 -m http.server 8000
# then visit http://<your-LAN-ip>:8000 on your phone
```

## Controls

- **Tap and hold** mid-air to dive (extra gravity); release to float (low gravity).
- Landing on a slope whose angle matches your flight angle = `PERFECT` (boost). Off-axis landings shed speed proportional to the mismatch.
- Spacebar / ArrowDown also dives (desktop testing).

## Files

- `index.html` — markup and HUD
- `style.css` — layout, HUD, overlay
- `game.js` — game loop, gates, momentum, rendering (HTML5 Canvas)
