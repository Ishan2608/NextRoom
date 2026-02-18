var MyApp = (function () {
  var socket;
  function init(uid, roomID) {
    event_process_for_signaling_server();
  }

  function event_process_for_signaling_server() {
    socket = io.connect();
    socket.on('connect', function () {
      alert('Socket Connected to Client-Side');
    })
  }

  return {
    _init: function (uid, roomID) {
      init(uid, roomID);
    },
  };
})();
