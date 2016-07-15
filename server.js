var request = require('request'); // simple request function
var cheerio = require('cheerio'); // dom extraction
var express = require('express');
var morgan = require('morgan'); // logger
var app = express();
var mongo = require('mongodb');
var config;
try { config = require('./config.js'); }
catch (err) { console.log('config.js not found.'); }
var mongoUrl = process.env.MONGODB_URI || config.mongoUri;
var port = process.env.PORT || 3000;

mongo.connect(mongoUrl, function (err, db) {

  if (err) throw new Error('Database failed to connect!');
  else console.log('Successfully connected to MongoDB.');

  // middleware logger
  app.use(morgan('short'));

  var search = express.Router();
  app.use('/search', search);
  search.get('*', function(req, res) {
    var query = req.params[0].slice(1);
    var offset = req.query.offset || 1;
    var doc = { 'query': null, 'date': null };

    if (query === '') {
      res.json({'error': 'No query'});
    }
    // let's save the query in db
    else {
      doc.query = query;
      doc.date = Date.now();
      db.listCollections({name:'imageSearch'})
        .toArray(function(err, collections) {
          if (collections === undefined) {
            // imageSearch doesn't exist, needs to be created
            db.createCollection('imageSearch', function (err, collection) {
              if (err) throw new Error('createCollection failed.');
              collection.insert(doc);
            });
          }
          else {
            // imageSearch exists 
            var collection = db.collection('imageSearch');
            collection.insert(doc);
          }
      });   

      // let's return the results
      var searchUrl = "https://www.google.com/search?q=" + query;
      searchUrl += "&sa=X&biw=1920&bih=979&tbs=isz:l&tbm=isch&ijn=1&ei=XUvcVavRDMqrerq0jNgJ";
      searchUrl += "&start="+ offset;
      searchUrl += "&ved=0CBsQuT0oAWoVChMI6_Pb54rExwIVypUeCh06GgOb&vet=10CBsQuT0oAWoVChMI6_Pb54rExwIVypUeCh06GgOb.XUvcVavRDMqrerq0jNgJ.i";

      request(searchUrl, function (err, response, html) {
        if (err) throw err;
        if (response.statusCode == 200) {
          var $ = cheerio.load(html);
          var imgUrl = '', pageUrl = '', altText = '';
          var results = [];
          $('a').each(function(index, el) {
            imgUrl = (/(imgurl=)(.+?)(&)/g).exec($(this).attr().href)[2];
            pageUrl = (/(imgrefurl=)(.+?)(&)/g).exec($(this).attr().href)[2];
            altText = $(this).find('.rg_ilmn').text();
            results.push({
              'image url': imgUrl,
              'page url': pageUrl,
              'text': altText
            });
          });
          // we truncate to 10 results
          results.length = 10;
          res.json(results);
        }
      });
    }
  });

  app.get('/latest', function(req, res) {
    db.collection('imageSearch')
      .find().sort({_id:-1}).limit(10)
      .toArray(function(err, elements) {
        if (err) throw err;
        var results = [];
        elements.forEach(function(obj, index) {
          var date = new Date(obj.date);
          var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
          var year = date.getFullYear();
          var month = months[date.getMonth()];
          var day = date.getDate();
          var hours = date.getHours();
          var minutes = "0" + date.getMinutes();
          var seconds = "0" + date.getSeconds();
          var formattedDate = day + '-' + month + '-' + year + ' ';
          formattedDate += hours + ':' + minutes.substr(-2) + ':' + seconds.substr(-2);
          results.push({
            'query': obj.query,
            'date': formattedDate
          });
        })
        res.json(results);
    });
  });

  app.get('/', function(req, res) {
    res.sendFile(__dirname + '/public/index.html');
  });

  app.listen(port, function () {
    console.log('Node.js listening on port ' + port + '...');
  });
  
});
