Meteor.startup(function(){

  Meteor.methods({
    addValues: function(valuesArray){ //A method to add values from the Raspberry Pi to the system;
      var currentDate = new Date();
      for(var i = 0; i < valuesArray.length; i++){
        var thisSensor_id = findSensor(valuesArray[i].sensorID, valuesArray[i].currentIP);
        var value = +valuesArray[i].value.match(/-??\d+/)[0];
        switch(valuesArray[i].sensorType){
          case "temp":
            value = value / 1000;
            break;
          default:
            value = value / 1000;
            break;
        }

        Readings.insert({
          sensor_id: thisSensor_id,
          value: value,
          time: currentDate.getTime()
        });
        testAlarms(thisSensor_id);
        clearAlarms(thisSensor_id);
        console.log("Added Reading", value, "from sensor", valuesArray[i].sensorID);
      }
    },
    updateSensor: function(sensor_id, name, desc, type){
      if(!Meteor.user()) return;
      Sensors.update({_id: sensor_id}, {$set: {name: name, type: type, desc: desc}});
      return;
    },
    addAlarm: function(sensor_id, name, alarmType, value, msgTypes){
      if(!Meteor.user()) return;
      console.log("Add Alarm");
      var sendEmail = (msgTypes.indexOf("email") > -1),
          sendSMS = (msgTypes.indexOf("sms") > -1);

      Alarms.insert({sensor_id: sensor_id, owner_id: Meteor.userId(), name: name, alarmType: alarmType, value: value, enabled:true, active:false, actions:{sendEmail: sendEmail, sendSMS:sendSMS}});
      return;
    },
    editAlarm: function(alarm_id, name, alarmType, value, msgTypes){
      if(!Meteor.user()) return;
      var sendEmail = (msgTypes.indexOf("email") > -1),
          sendSMS = (msgTypes.indexOf("sms") > -1);
      Alarms.update({_id: alarm_id}, {$set: {name: name, alarmType: alarmType, value: value, enabled:true, active:false, actions:{sendEmail: sendEmail, sendSMS:sendSMS}}});
      return;
    },
    convertOldValues: function(){
      var allReadings = Readings.find({$or: [{value: {$gt: 1000}}, {value: {$lt: -1000}}]});
      allReadings.forEach(function(doc){
        Readings.update({_id: doc._id}, {$set: {value: doc.value / 1000}});
      })


    }
  })
})


var findSensor = function(sensorID, currentIP){
  var thisSensor =  Sensors.findOne({sensorID: sensorID});
  if (thisSensor) {
    Sensors.update({_id: thisSensor._id}, {$set: {currentIP:currentIP}});
    return thisSensor._id;
  } else {
    return Sensors.insert({
      sensorID: sensorID,
      name: "",
      type: "",
      metric: "",
      currentIP: currentIP,
      desc: ""
    });
  }
}

var testReadingsAbove = function(occurencesRequired, occurences, value){
  var total = 0;
  occurences.forEach(function(doc){
    console.log("ReadingValue: " + doc.value);
    if(doc.value > value) total++;
  })
  return total >= occurencesRequired;
}
var testReadingsBelow = function(occurencesRequired, occurences, value){
  var total = 0;
  occurences.forEach(function(doc){
    console.log("ReadingValue: " + doc.value);
    if(doc.value < value) total++;
  })
  return total >= occurencesRequired;
}

var testAlarms = function(sensor_id){
  var allAlarms = Alarms.find({sensor_id: sensor_id, enabled:true, active: false});
  allAlarms.forEach(function(doc){
    console.log("AlarmValue: " + doc.value + " _ " + doc.alarmType);
    switch(doc.alarmType){
      case "above":
        if(testReadingsAbove(3, Readings.find({sensor_id: doc.sensor_id}, {sort:{time:-1}, limit:5}), doc.value)) activateAlarm(doc._id);
        break;
      case "below":
        if(testReadingsBelow(3, Readings.find({sensor_id: doc.sensor_id}, {sort:{time:-1}, limit:5}), doc.value)) activateAlarm(doc._id);
        break;
      case "stop":
        var timeValue = new Date().getTime() - (doc.value * 60 * 1000); //Get the curent time, and subtract the determined test time from it
        var recentReading = Readings.findOne({sensor_id: doc.sensor_id, time: {$gte: timeValue}}); //Look for a reading from this sensor within the timeframe
        if(!recentReading){ //If no readings, set off this alarm
          activateAlarm(doc._id);
        }
        break;
    }
  })
  console.log("Tested Alarms");
}

var clearAlarms = function(sensor_id){
  var allAlarms = Alarms.find({sensor_id: sensor_id, enabled:true, active: true});
  allAlarms.forEach(function(doc){
    console.log("ClearAlarmValue: " + doc.value + " _ " + doc.alarmType);
    switch(doc.alarmType){
      case "above":
        if(!testReadingsAbove(3, Readings.find({sensor_id: doc.sensor_id}, {sort:{time:-1}, limit:5}), doc.value)) deactivateAlarm(doc._id);
        break;
      case "below":
        if(!testReadingsBelow(3, Readings.find({sensor_id: doc.sensor_id}, {sort:{time:-1}, limit:5}), doc.value)) deactivateAlarm(doc._id);
        break;
      case "stop":
        var timeValue = new Date().getTime() - (doc.value * 60 * 1000); //Get the curent time, and subtract the determined test time from it
        var recentReading = Readings.findOne({sensor_id: doc.sensor_id, time: {$gte: timeValue}}); //Look for a reading from this sensor within the timeframe
        if(recentReading){ //If there's a reading within the desired time frame, shut off this alarm
          deactivateAlarm(doc._id);
        }
        break;
    }
  })
  console.log("Cleared Alarms");
}


var deactivateAlarm = function(alarm_id){
  Alarms.update({_id: alarm_id}, {$set: {active:false}});
}


var activateAlarm = function(alarm_id){
  Alarms.update({_id: alarm_id}, {$set: {active:true}});
  var thisAlarm = Alarms.findOne({_id: alarm_id});
  if(thisAlarm.actions.sendEmail){
    sendEmailAlert(alarm_id);
  }
  if(thisAlarm.actions.sendSMS){
    sendSMSAlert(alarm_id);
  }
}

var sendSMSAlert = function(alarm_id){

}

var sendEmailAlert = function(alarm_id){
  var thisAlarm = Alarms.findOne({_id: alarm_id});
  var thisSensor = Sensors.findOne({_id: thisAlarm.sensor_id});
  var latestReading = Readings.findOne({sensor_id: thisAlarm.sensor_id}, {sort:{time:-1}})
  var owner = Meteor.users.findOne({_id: thisAlarm.owner_id});

  var html = "<h2>You've received an alert from " + thisSensor.name + ".</h2> <h4>From the alarm for " + thisAlarm.name + ". The most recent reading is </h4><h3>" + CentigradeToFarenheit(latestReading.value) + " degrees F.</h3>";
  var text = "You've received an alert from " + thisSensor.name + ", from the alarm for " + thisAlarm.name + ". The most recent reading is " + CentigradeToFarenheit(latestReading.value) + " degrees F.";

  Email.send({
    from: "alerts@greenhouse.clayson.io",
    to: owner.emails[0].address,
    subject: "Alert from Greenhouse",
    text: html,
    html: text
  });
}
