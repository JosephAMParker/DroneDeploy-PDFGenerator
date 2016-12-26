import os
import tornado.httpserver
import tornado.ioloop
import tornado.web
import requests
import grequests
import math
import json

from PIL import Image
from PIL import ImageDraw
from PIL import ImageFont
from io import BytesIO
import urllib
import base64

def hex2RGB(hexcolor,a):

    r = int(hexcolor[1:3], 16)
    g = int(hexcolor[3:5], 16)
    b = int(hexcolor[5:7], 16)

    return (r,g,b,a)

def getTileXY(tileURL):

    tileURL = tileURL.split("ortho_bhd/")[1].split("/")
    return int(tileURL[1]), int(tileURL[2].split(".")[0])

def getXYFromLatLng(geoObject, level):

    level = level - 8
    latitude  = geoObject['lat']
    longitude = geoObject['lng'] 

    sinLatitude = math.sin(latitude * math.pi/180)
    pixelX = ((longitude + 180) / 360) * 256 * 2**level
    pixelY = (0.5 - math.log((1 + sinLatitude) / (1 - sinLatitude)) / (4 * math.pi)) * 256 * 2**level

    return pixelX,pixelY

def getImageDimensions(planGeo,level):

    x0,y0 = getXYFromLatLng(planGeo[0], level)
    x2,y2 = getXYFromLatLng(planGeo[2], level)

    width = (x2 - x0)*256
    height = (y2 - y0)*256

    return x0,y0,int(width)+1,int(height)+1

def getFont(fontname,fontwidth):

    fontsize = 1
    path = os.getcwd()
    font = ImageFont.truetype(path+fontname, fontsize)

    #increase the fontsize until the desired size is found. ie The radius of the circle the letter is printed in. 
    while font.getsize("A")[0] < fontwidth:
        fontsize += 1
        font = ImageFont.truetype(path+fontname, fontsize)

    return font

def pasteTiles(image,tiles,map_x,map_y):

    requests = (grequests.get(u) for u in tiles)
    responses = grequests.map(requests)

    for i,response in enumerate(responses):
        tile_x,tile_y = getTileXY(tiles[i])
        image_file = BytesIO(response.content)
        im = Image.open(image_file)

        image.paste(im,(int((tile_x-map_x)*256),int((tile_y-map_y)*256)))

    return image

def drawAnnotations(image, annotations,map_x,map_y,width,height,level):

    font = getFont("/Montserrat-Bold.ttf",width*0.02)
    r = width * 0.02
    A = 65

    # draw all annotations. xMiddle, yMiddle is the coordinates of the label for each annotation.
    # volume/area: middle of all points. 
    # line:        end point of middle line.
    # location     coords of the location
    for a,annotation in enumerate(annotations):
        poly  = Image.new('RGBA', (width,height))
        pdraw = ImageDraw.Draw(poly)
        xMiddle, yMiddle = 0,0

        if annotation['annotationType'] == "LOCATION":

            xMiddle,yMiddle = getXYFromLatLng(annotation['geometry'],level)

        elif annotation['annotationType'] == "LINE":

            line    = []
            for i,geoObject in enumerate(annotation['geometry']):
                x,y = getXYFromLatLng(geoObject,level)

                if i == math.floor(len(annotation['geometry'])/2):
                    xMiddle = x
                    yMiddle = y 

                line.append((int((x-map_x)*256),int((y-map_y)*256)))
            
            pdraw.line(line,annotation['color'], width=int(r/5))

        else:

            polygon = []
            for geoObject in annotation['geometry']:
                x,y = getXYFromLatLng(geoObject,level)
                xMiddle += x
                yMiddle += y 
                polygon.append((int((x-map_x)*256),int((y-map_y)*256)))
            pdraw.polygon(polygon, hex2RGB(annotation['fillColor'],70), outline=annotation['color'])

            polygon.append(polygon[0])
            pdraw.line(polygon, annotation['color'], width=int(r/5))


        if annotation['annotationType'] == "AREA" or annotation['annotationType'] == "VOLUME":
            xMiddle /= len(annotation['geometry'])
            yMiddle /= len(annotation['geometry'])

        pdraw.ellipse( [(xMiddle-map_x)*256-r, (yMiddle-map_y)*256-r, (xMiddle-map_x)*256+r, (yMiddle-map_y)*256+r], fill=annotation['color'])
        pdraw.text( ((xMiddle-map_x)*256-r*0.4,(yMiddle-map_y)*256-r*0.8), chr(A+a),font=font)

        image.paste(poly, (0,0), mask=poly)

    return image


class MainHandler(tornado.web.RequestHandler):
    
    def get(self):
        self.write("PDF Generator for dronedeploy. Visit https://www.dronedeploy.com/app2/dashboard to use")

    def post(self):

        data = tornado.escape.json_decode(self.request.body)
        tiles = data['tiles']
        planGeo = data['planGeo']
        level   = int(data['zoom_level'])
        annotations = data['annotations']
        
        map_x,map_y,width,height=getImageDimensions(planGeo,level)

        image = Image.new('RGBA', (width,height))
        image = pasteTiles(image,tiles,map_x,map_y)
        image = drawAnnotations(image,annotations,map_x,map_y,width,height,level)


        new_width = 1800 #image on client side is printed as 1800 px across
        new_height = int(height * new_width / width)
        image=image.resize((new_width,new_height))
        outputBuffer = BytesIO()
        image.save(outputBuffer, format='JPEG')
        bgBase64Data = outputBuffer.getvalue()

        out = {}
        out['image'] = 'data:image/jpeg;base64,' + base64.b64encode(bgBase64Data).decode()
        out['new_height'] = new_height
        self.write(json.dumps(out))

    def set_default_headers(self):
        # allow cross-origin requests to be made from your app on DroneDeploy to your web server
        self.set_header("Access-Control-Allow-Origin", "https://www.dronedeploy.com")
        self.set_header("Access-Control-Allow-Headers", "x-requested-with")
        # add more allowed methods when adding more handlers (POST, PUT, etc.)
        self.set_header("Access-Control-Allow-Methods", "POST, OPTIONS")

    def options(self):
        # no body
        self.set_status(204)
        self.finish()

def main():
    application = tornado.web.Application([
        (r"/", MainHandler),
    ])
    http_server = tornado.httpserver.HTTPServer(application)
    port = int(os.environ.get("PORT", 5000))
    http_server.listen(port)
    tornado.ioloop.IOLoop.instance().start()
 
if __name__ == "__main__":
    main()