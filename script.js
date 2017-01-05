 
var generateButton = document.querySelector("#generate-button");
var zoom_level = 18;

function updateZoom(value) {
  document.querySelector("#zoom").value = value;
  zoom_level = parseInt(value);

  if (value >= 20){
    document.querySelector("#msg").innerHTML = "Using too a high zoom level could mean long load times.";
    document.querySelector("#msg").style = "color:red;";
  }

  else{
    document.querySelector("#msg").innerHTML = "";
    document.querySelector("#msg").style = "";
  }
}

function dronedeployApiReady(){
  return new Promise((resolve) => {
    window.dronedeploy.onload(() => {
       generateButton.addEventListener("click", generatePDFListener);
    });
  });
}

function reportError(e,msg){
  document.querySelector("#msg").innerHTML = msg + " Check console for error.";
  document.querySelector("#msg").style = "color:red;";
  throw new Error(e);
}

function generatePDFListener(){

  document.querySelector("#msg").innerHTML = "Generating...";
  document.querySelector("#msg").style = "";

  getCurrentlyViewedPlan()                                       .catch(e => reportError(e,"Error getting Plan."))
    .then(plan         => getTileDataFromPlan(plan)              .catch(e => reportError(e,"Error getting Tiles."))
    .then(tileResponse => getAnnotations(plan)                   .catch(e => reportError(e,"Error getting Annotations."))
    .then(annotations  => sendTilesToServer(plan.geometry,tileResponse,annotations) .catch(e => reportError(e,"Error contacting server."))
    .then(response     => getResponseBlob(response)              .catch(e => reportError(e,"Error reading response from server."))
    .then(responseBlob => readResponseBlob(responseBlob)         .catch(e => reportError(e,"Error reading response from server."))
    .then(reader       => generatePDF(plan, reader, annotations)  
  ))))))

}

function getCurrentlyViewedPlan(){
  return window.dronedeploy.Plans.getCurrentlyViewed();
}

function getTileDataFromPlan(plan){
  return window.dronedeploy.Tiles.get({planId: plan.id, layerName: "ortho", zoom: zoom_level}); 
}

function getAnnotations(plan){
  return window.dronedeploy.Annotations.get(plan.id);
}

function sendTilesToServer(planGeo,tileResponse, annotations){
  
  var body = {
    tiles: tileResponse.tiles,
    planGeo: planGeo,
    zoom_level: zoom_level,
    annotations: annotations
  };


  JSON.stringify(body);
  return fetch("https://dronedeploy-pdf-generator.herokuapp.com/", {
    method: "POST",
    body: JSON.stringify(body)
  });
}

function getResponseBlob(response){
  return response.blob();
}

function readResponseBlob(responseBlob){

  return new Promise((resolve) => {

    var reader = new FileReader();
    reader.onloadend = () => resolve(reader);
    reader.readAsBinaryString(responseBlob);

  });
}

function generatePDF(plan, reader, annotations){
 
  responseJSON = JSON.parse(reader.result);

  //2.83456: mm to pt. Using doc.autoTable requires jsPDF in pt form,
  // cannot currently use mm or cm. 
  mm2pt = 2.83456;
  width = responseJSON.new_width*mm2pt/10
  left_margin = (180*mm2pt - width)/2 + 15*mm2pt

  //create columns and rows for annotation table
  var columns = ["ID", "Distance", "Area", "Volume"];
  var rows = [];
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

  var doc = new jsPDF("p","pt");
  doc.text(plan.name, left_margin, 30);
  doc.addImage(responseJSON.image, "JPEG", left_margin, 40, width, responseJSON.new_height*mm2pt/10);
  doc.autoTable(columns, rows, {startY:responseJSON.new_height*mm2pt/10+40+10, tableWidth:180*mm2pt, margin:{left:15*mm2pt}});
  doc.save(plan.name + ".pdf");

  document.querySelector("#msg").innerHTML = "Finished";
  document.querySelector("#msg").style = "";

}

dronedeployApiReady();
  
 
 


 
