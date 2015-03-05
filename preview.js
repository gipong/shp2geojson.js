/*
 * predefined [EPSG:3826], [EPSG:3821], [EPSG:3825], [EPSG:3828] ,[EPSG:3857] projections
 * If your desired projection is not here, the default projection is EPSG:4326
 * 
 * Usage :
 *      loadshp({
 *          url: '/shp/test.zip', // path or your upload file
 *          encoding: 'big5' // default utf-8
 *          EPSG: 3826 // default 4326
 *      }, function(geojson) {
 *          // geojson returned
 *      });
 *
 * Created by Gipong <sheu781230@gmail.com>
 * 
 */

var inputData = {},
    geoData = {},
    EPSGUser,
    EPSG4326 = proj4('EPSG:4326');

proj4.defs([
    ['EPSG:3826', '+title=TWD97 TM2 zone 121 +proj=tmerc +lat_0=0 +lon_0=121 +k=0.9999 +x_0=250000 +y_0=0 +ellps=GRS80 +units=m +no_defs'],
    ['EPSG:3821', '+title=TWD67 +proj=longlat +towgs84=-752,-358,-179,-.0000011698,.0000018398,.0000009822,.00002329 +ellps=aust_SA +units=degrees +no_defs'],
    ['EPSG:3825', '+title=TWD97 TM2 zone 119 +proj=tmerc +lat_0=0 +lon_0=119 +k=0.9999 +x_0=250000 +y_0=0 +ellps=GRS80 +units=m +no_defs'],
    ['EPSG:3828', '+title=TWD67 TM2 zone 121 +proj=tmerc +lat_0=0 +lon_0=121 +k=0.9999 +x_0=250000 +y_0=0 +ellps=aust_SA +units=m +no_defs'],
    ['EPSG:3857', '+proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0 +k=1.0 +units=m +nadgrids=@null +wktext +no_defs']
]);

function loadshp(config, returnData) {
    var url = config.url,
        encoding = typeof config.encoding != 'utf-8' ? config.encoding : 'utf-8',
        EPSG = typeof config.EPSG != 'undefined' ? config.EPSG : 4326;

    EPSGUser = proj4('EPSG:'+EPSG);
    if( typeof url != 'string' ) {
        var reader = new FileReader();
        reader.onload = function(e) {
            var URL = window.URL || window.webkitURL,
                zip = new JSZip(e.target.result),
                shpString =  zip.file(/.shp$/)[0].name,
                dbfString = zip.file(/.dbf$/)[0].name;

            SHPParser.load(URL.createObjectURL(new Blob([zip.file(shpString).asArrayBuffer()])), shpLoader, returnData);
            DBFParser.load(URL.createObjectURL(new Blob([zip.file(dbfString).asArrayBuffer()])), encoding, dbfLoader, returnData);
        }

        reader.readAsArrayBuffer(url);
    } else {
        JSZipUtils.getBinaryContent(url, function(err, data) {
            if(err)  throw err;

            var URL = window.URL || window.webkitURL,
                zip = new JSZip(data),
                shpString =  zip.file(/.shp$/)[0].name,
                dbfString = zip.file(/.dbf$/)[0].name;

            SHPParser.load(URL.createObjectURL(new Blob([zip.file(shpString).asArrayBuffer()])), shpLoader, returnData);
            DBFParser.load(URL.createObjectURL(new Blob([zip.file(dbfString).asArrayBuffer()])), encoding, dbfLoader, returnData);

        });
    }
}

function TransCoord(x, y) {
    if (proj4)
        var p = proj4(EPSGUser, EPSG4326 , [parseFloat(x), parseFloat(y)]);
    return {x: p[0], y: p[1]};
}

function shpLoader(data, returnData) {
    inputData['shp'] = data;
    if(inputData['shp'] && inputData['dbf']) 
        if(returnData) returnData(  toGeojson(inputData)  );
}

function dbfLoader(data, returnData) {
    inputData['dbf'] = data;
    if(inputData['shp'] && inputData['dbf']) 
        if(returnData) returnData(  toGeojson(inputData)  );
}

function toGeojson(geojsonData) {
    var geojson = {},
        features = [],
        feature, geometry, points;

    var shpRecords = geojsonData.shp.records;
    var dbfRecords = geojsonData.dbf.records;

    geojson.type = "FeatureCollection";
    geojson.bbox = [
        geojsonData.shp.minX,
        geojsonData.shp.minY,
        geojsonData.shp.maxX,
        geojsonData.shp.maxY
    ];

    geojson.features = features;

    for (var i = 0; i < shpRecords.length; i++) {
        feature = {};
        feature.type = 'Feature';
        geometry = feature.geometry = {};
        properties = feature.properties = dbfRecords[i];

        // point : 1 , polyline : 3 , polygon : 5, multipoint : 8
        switch(shpRecords[i].shape.type) {
            case 1:
                geometry.type = "Point";
                var reprj = TransCoord(shpRecords[i].shape.content.x, shpRecords[i].shape.content.y);
                geometry.coordinates = [
                    reprj.x, reprj.y
                ];
                break;
            case 3:
            case 8:
                geometry.type = (shpRecords[i].shape.type == 3 ? "LineString" : "MultiPoint");
                geometry.coordinates = [];
                for (var j = 0; j < shpRecords[i].shape.content.points.length; j+=2) {
                    var reprj = TransCoord(shpRecords[i].shape.content.points[j], shpRecords[i].shape.content.points[j+1]);
                    geometry.coordinates.push([reprj.x, reprj.y]);
                };
                break;
            case 5:
                geometry.type = "Polygon";
                geometry.coordinates = [];

                for (var pts = 0; pts < shpRecords[i].shape.content.parts.length; pts++) {
                    var partsIndex = shpRecords[i].shape.content.parts[pts],
                        part = [],
                        dataset;

                    for (var j = partsIndex*2; j < (shpRecords[i].shape.content.parts[pts+1]*2 || shpRecords[i].shape.content.points.length); j+=2) {
                        var point = shpRecords[i].shape.content.points;
                        var reprj = TransCoord(point[j], point[j+1]);
                        part.push([reprj.x, reprj.y]);
                    };
                    geometry.coordinates.push(part);

                };
                break;
            default:
        }
        features.push(feature);
    };
    return geojson;
}