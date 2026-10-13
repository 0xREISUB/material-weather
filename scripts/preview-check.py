import ast
import ctypes
import json
import os
from pathlib import Path
import subprocess
import time
from PIL import Image, ImageChops

root = Path(__file__).resolve().parent.parent / '.preview'
env = dict(os.environ, DBUS_SESSION_BUS_ADDRESS=(root / 'dbus-address').read_text())
walk = 'const walk = actor => [actor, ...actor.get_children().flatMap(walk)]; const box = Main.panel.statusArea["material-weather@reisub.local"].menu.box; const scroll = walk(box).find(actor => actor.style_class?.split(" ").includes("mw-hourly-scroll"));'
def call(method, *args):
    output = subprocess.check_output(['gdbus','call','--session','--dest','org.gnome.Shell','--object-path','/org/gnome/Shell','--method',method,*args], env=env, text=True)
    return ast.literal_eval(output.replace('(true,','(True,',1).replace('(false,','(False,',1))
def evaluate(expression):
    success, result = call('org.gnome.Shell.Eval', expression)
    if not success: raise RuntimeError(result)
    return json.loads(result)
def snapshot():
    return evaluate('(() => {' + walk + ' const [x,y] = scroll.get_transformed_position(); return {x,y,width:scroll.width,height:scroll.height,value:scroll.hadjustment.value,days:walk(box).filter(a=>a.style_class?.split(" ").includes("mw-day")).length,hours:walk(scroll).filter(a=>a.style_class?.split(" ").includes("mw-hour-column")).length,open:Main.panel.statusArea["material-weather@reisub.local"].menu.isOpen}; })()')
def screenshot(name):
    path = root / name
    success, result = call('org.gnome.Shell.Screenshot.Screenshot', 'false', 'false', str(path))
    if not success: raise RuntimeError(result)
    return Image.open(path).convert('RGB')
xlib = ctypes.CDLL('libX11.so.6')
xtest = ctypes.CDLL('libXtst.so.6')
xlib.XOpenDisplay.argtypes=[ctypes.c_char_p]; xlib.XOpenDisplay.restype=ctypes.c_void_p
xlib.XFlush.argtypes=[ctypes.c_void_p]; xlib.XCloseDisplay.argtypes=[ctypes.c_void_p]
xtest.XTestFakeMotionEvent.argtypes=[ctypes.c_void_p,ctypes.c_int,ctypes.c_int,ctypes.c_int,ctypes.c_ulong]
xtest.XTestFakeButtonEvent.argtypes=[ctypes.c_void_p,ctypes.c_uint,ctypes.c_int,ctypes.c_ulong]
display = xlib.XOpenDisplay((root / 'display').read_text().encode())
if not display: raise RuntimeError('Önizleme ekranı açılamadı')
def motion(x,y):
    xtest.XTestFakeMotionEvent(display,-1,int(x),int(y),0); xlib.XFlush(display); time.sleep(.06)
def button(number, pressed, delay=.05):
    xtest.XTestFakeButtonEvent(display,number,pressed,0); xlib.XFlush(display); time.sleep(delay)
try:
    before = snapshot()
    assert before['open'] and before['days']==5 and before['hours']>=24, before
    cx,cy = before['x']+before['width']/2,before['y']+before['height']/2
    motion(cx,cy)
    button(4,1,0); button(4,0,0)
    samples = []
    for delay in [.06,.08,.08,.16]:
        time.sleep(delay)
        samples.append(snapshot()['value'])
    assert samples[-1]>before['value'] and len(set(samples))>=2, samples
    assert all(value == round(value) for value in samples), samples
    wheel = snapshot()
    motion(cx+100,cy); button(1,1)
    for distance in [40,80,120,160,200]: motion(cx+100-distance,cy)
    button(1,0)
    drag = snapshot()
    assert drag['open'] and drag['value']>=wheel['value']+150, (wheel,drag)
    time.sleep(.2)
    crop = tuple(map(int, (drag['x']+4,drag['y']+4,drag['x']+drag['width']-4,drag['y']+drag['height']-4)))
    image_before = screenshot('scroll-before-redraw.png').crop(crop)
    evaluate('(() => {' + walk + ' scroll.add_style_pseudo_class("redraw-check"); return true; })()')
    time.sleep(.15)
    evaluate('(() => {' + walk + ' scroll.remove_style_pseudo_class("redraw-check"); return true; })()')
    time.sleep(.15)
    image_after = screenshot('scroll-after-redraw.png').crop(crop)
    difference = ImageChops.difference(image_before,image_after)
    changed = sum(max(pixel)>8 for pixel in difference.getdata())
    assert changed <= 5, f'Redraw changed {changed} pixels in the hourly strip'
    print(json.dumps({'animation_samples':samples,'drag_distance':drag['value']-wheel['value'],'redraw_changed_pixels':changed}))
finally:
    xlib.XCloseDisplay(display)
