 
var generateButton = document.querySelector('#generate-button');
var zoom_level = 18

function updateZoom(value) {
  document.querySelector('#zoom').value = value;
  zoom_level = parseInt(value);

  if (value >= 20){
    document.querySelector('#msg').innerHTML = "Using too a high zoom level could mean long load times.";
    document.querySelector('#msg').style = "color:red;";
  }

  else{
    document.querySelector('#msg').innerHTML = "";
    document.querySelector('#msg').style = "";
  }
}

function dronedeployApiReady(){
  return new Promise((resolve) => {
    window.dronedeploy.onload(() => {
       generateButton.addEventListener('click', generatePDFListener);
    });
  });
}

function generatePDFListener(){

  document.querySelector('#msg').innerHTML = "Generating...";
  document.querySelector('#msg').style = "";

  getCurrentlyViewedPlan().then(function(plan) {
    getTileDataFromPlan(plan).then(function(tileResponse) {
      getAnnotations(plan).then(function(annotations){
        sendTilesToServer(plan.geometry,tileResponse,annotations).then(function(response) {
          readResponse(response).then(function(imageData){

            generatePDF(plan,imageData, annotations);

          });
        }).catch(function(e) {    
          document.querySelector('#msg').innerHTML = "Error contacting server. Check console for error.";
          document.querySelector('#msg').style = "color:red;";
          throw e;});
      }).catch(function(e) {     
          document.querySelector('#msg').innerHTML = "Error getting Annotations. Check console for error.";
          document.querySelector('#msg').style = "color:red;";
          throw e;});
    }).catch(function(e) {     
          document.querySelector('#msg').innerHTML = "Error getting Tiles. Check console for error.";
          document.querySelector('#msg').style = "color:red;";
          throw e;});
  }).catch(function(e) {     
          document.querySelector('#msg').innerHTML = "Error getting Plan. Check console for error.";
          document.querySelector('#msg').style = "color:red;";
          throw e;});
}

function getCurrentlyViewedPlan(){
  return window.dronedeploy.Plans.getCurrentlyViewed()
}

function getTileDataFromPlan(plan){
  return window.dronedeploy.Tiles.get({planId: plan.id, layerName: "ortho", zoom: zoom_level}); 
}

function getAnnotations(plan){
  return window.dronedeploy.Annotations.get(plan.id)
}

function sendTilesToServer(planGeo,tileResponse, annotations){
  
  var body = {
    tiles: tileResponse.tiles,
    planGeo: planGeo,
    zoom_level: zoom_level,
    annotations: annotations,
  };


  JSON.stringify(body);
  return fetch('https://dronedeploy-pdf-generator.herokuapp.com/', {
    method: 'POST',
    body: JSON.stringify(body)
  });
}

function readResponse(response){
  return response.blob();
}

function generatePDF(plan, imageData, annotations){

 
  var reader = new FileReader();
  
  reader.addEventListener("loadend", function() {
    var doc = new jsPDF('p','pt')

    //2.83456: mm to pt. Using doc.autoTable requires jsPDF in pt form, cannot currently use mm or cm. 
    doc.text(plan.name, 15*2.83465, 30) 

    try{
      out=JSON.parse(reader.result);
    } catch(e){ console.log(e);
      document.querySelector('#msg').innerHTML = "Received Error from server. Check console for error.";
      document.querySelector('#msg').style = "color:red;"; throw e;
    }
    
    doc.addImage(out.image, 'JPEG', 15*2.83465, 40, 180*2.83465, out.new_height*0.283465)

    var columns = ["ID", "Distance", "Area", "Volume"];
    var rows = []
    for (a in annotations){
      annotation = annotations[a];

      var chr = String.fromCharCode(65 + parseInt(a));

      if (annotation.annotationType == "LINE")
        var row = [chr, annotation.info.geometry[0].value + " m" , "-", "-"];
      
      else if (annotation.annotationType == "AREA")
        var row = [chr, "-", annotation.info.geometry[0].value + " m^2", "-"];

      else if (annotation.annotationType == "VOLUME")
        var row = [chr, "-", "-", annotation.info.geometry[0].value + " m^3"];

      else
        var row = [chr, "-", "-", "-"];

      rows.push(row);
    }

    doc.autoTable(columns, rows, {startY:out.new_height*0.283456+40+10});
    doc.save(plan.name + '.pdf')

    document.querySelector('#msg').innerHTML = "Finished";
    document.querySelector('#msg').style = "";
  });

  reader.readAsBinaryString(imageData)

}

dronedeployApiReady()
  
 
 


 
