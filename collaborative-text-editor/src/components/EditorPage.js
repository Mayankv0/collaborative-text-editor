import React, { useEffect, useState, useRef } from 'react';
import ReactQuill, { Quill } from 'react-quill';
import 'quill/dist/quill.snow.css';
import io from 'socket.io-client';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import Delta from 'quill-delta';
import toast from 'react-hot-toast';
import Client from '../components/Client';
import QuillCursors from 'quill-cursors';

Quill.register('modules/cursors', QuillCursors);




const EditorPage = () => {
  const { roomId } = useParams();
  const { search } = useLocation();
  const query = new URLSearchParams(search);
  const username = query.get('username');
  const reactNavigator = useNavigate();

  const [socket, setSocket] = useState(null);
  const [documentState, setDocumentState] = useState(null); 
  const [clients, setClients] = useState([]);               
  
  const quillRef = useRef(null);

  const modules = {
    cursors: {
      hideDelayMs: 500, 
      hideSpeedMs: 300,
      selectionChangeSource: null,
      transformOnTextChange: true
      
  },
    toolbar: [
      [{ header: [1, 2, false] }],
      ['bold', 'italic', 'underline'],
      ['image', 'code-block']
    ]
  };

  useEffect(() => {
    console.log("1st time copounent rendering. So, Quill REF: "+ quillRef.current);
    if(quillRef.current) return;        
    const editor = quillRef.current.getEditor();

    editor.setText('Loading...');
    quillRef.current = editor;
    console.log("1st useEffect For Quill Initialization");
  }, []);


  useEffect(() => {
    if (!quillRef.current) {
      console.error("Quill Editor is not initialized yet.");
      return;
    }
    console.log("2nd useEffect");

    const socketInstance = io('http://localhost:5000');
    setSocket(socketInstance);

    socketInstance.on('connect', () => {
      console.log("Socket connected, joining room with ID:", roomId);
      socketInstance.emit('join-room', { roomId, username });
    });
    
    socketInstance.on('user-joined', (username) => {
      if(typeof socket === 'undefined') return;
      setClients(prev => [...prev, username]);

      const color = generateRandomColor();
      const cursors = quillRef.current.getEditor().getModule("cursors");
      const allCursors = cursors.cursors();
      console.log("All available cursors " + JSON.stringify(allCursors));
      if(!allCursors.some(cursor => cursor.id === username)){
        cursors.createCursor(username, username, color);
      }
   
      toast.success(`${username} has joined the room.`);
      socketInstance.emit('connected-users', clients);      
    });

    socketInstance.on('connected-users', handleConnectedUsers); 

    socketInstance.on('initialize-document', (documentState) => {
      const delta = new Delta(documentState);

      if (typeof documentState === 'object' && documentState !== null) {
        quillRef.current.getEditor().setContents(delta, 'silent');
        setDocumentState(delta);
      } 
      else {
        console.error('Document state is neither a string nor a valid object:', documentState);
        quillRef.current.getEditor().setText('Failed to load document.');
      }
      quillRef.current.getEditor().enable();
    });

    socketInstance.on('text-change', (data) => {
      if (data.username !== username) {
        const delta =new Delta(data.delta);
        quillRef.current.getEditor().updateContents(delta, 'silent');
        setDocumentState((prevState) => {
          if (prevState) 
          {
            const newDocumentState = prevState.compose(delta);
            return newDocumentState;
          } 
          else 
          {
            console.error("Previous state is undefined.");
            return new Delta(); 
          }
        } );
      }
    });

    socketInstance.on('user-left', (username) => {
      setClients(prev => prev.filter(user => user !== username));

      const cursors = quillRef.current.getEditor().getModule("cursors");
      cursors.removeCursor(username, username);

      toast.success(`${username} has left the room.`);
      socketInstance.emit('connected-users', clients);
    });
    

    return () => {
      socketInstance.off('user-joined');
      socketInstance.off('connected-users');
      socketInstance.off('initialize-document');
      socketInstance.off('text-change');
      socketInstance.off('user-left');
      socketInstance.disconnect();
      if(quillRef.current)         
        quillRef.current.getEditor().off('text-change');
      console.log("Cleaned up on component unmount");
    };
  }, [roomId, username]);

  const handleConnectedUsers = (users) => {
    console.log(`Updated list of connected users: ${users}`);
    setClients(users);
  };

  const leaveRoom = () => {
    if(!socket) return;
    socket.emit('leave-room', { roomId, username });
    reactNavigator('/');
  };


  useEffect(() => {
    if (!socket || !quillRef.current) return;

    const handleTextChange = (delta, oldDelta, source) => {
      if (source !== 'user') return;

      let range = quillRef.current.getEditor().getSelection();
      if (range) {
        if (range.length == 0) {
          socket.emit('cursor-move', {roomId, username, cursorPos: range});
        } else {
          console.log('User has made a selection');
        }
      }

      socket.emit('text-change', { roomId, username, delta:delta });
      saveCurrentDocumentState();  
    };

    const handleSelectionChange = (range) => {
      if(!socket) return;
      socket.emit('cursor-selection', {roomId, username, cursorPos: range});
      console.log("Selection-change of quill: " + JSON.stringify(range) );  
    };

    socket.on('remote-cursor-selection', ({username, cursorPos}) => {
      console.log("Remote cursor selection point for " + username + " "+ JSON.stringify(cursorPos));
      const color = generateRandomColor();
      const cursors = quillRef.current.getEditor().getModule("cursors");
      const allCursors = cursors.cursors();
      console.log("ALl cursors " + JSON.stringify(allCursors));
      if(!allCursors.some(cursor => cursor.id === username)){
        cursors.createCursor(username, username, color);
      }
        
      cursors.moveCursor(username, cursorPos); 
      cursors.toggleFlag(username, true);
    });

    socket.on('remote-cursor-move', ({username, cursorPos})=> {
      console.log("Remote cursor move for " + username + " "+ JSON.stringify(cursorPos));
      const cursors = quillRef.current.getEditor().getModule("cursors");
      cursors.moveCursor(username, cursorPos); 
      cursors.toggleFlag(username, true);
    });

    quillRef.current.getEditor().on('text-change', handleTextChange);

    quillRef.current.getEditor().on('selection-change', (range, oldRange, source) => {
      handleSelectionChange(range);
    });

    return () => {
      socket.off('remote-cursor-selection');
      socket.off('remote-cursor-move');

      if(quillRef.current){
        quillRef.current.getEditor().off('text-change', handleTextChange);
        quillRef.current.getEditor().off('selection-change');
      }
    };
  }, [socket, roomId, username]);


    const saveCurrentDocumentState = () => {
      if (!quillRef.current) return;
      if (quillRef.current) {
        const currentContents = quillRef.current.getEditor().getContents(); 
        const serializedContent = JSON.stringify(currentContents);
        socket.emit('save-document', { roomId, content: serializedContent });
      }
    };

    const copyRoomId = () => {
      navigator.clipboard.writeText(roomId);
      toast.success('Room ID copied to clipboard!');
    };

    function generateRandomColor() {
      const letters = '0123456789ABCDEF';
      let color = '#';
      for (let i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
      }
      return color;
    }

  return (
  
    <div className="mainWrap">
      <div className="aside">
          <div className="asideInner">
              <div className="logo">
                  <img
                      className="logoImage"
                      src="/code-sync_1.png"
                      alt="logo"
                  />
              </div>
              <h3>Connected</h3>
              <div className="clientsList">
                  {clients.map((client, index) => (
                      <Client
                          key={index}
                          username={client}
                          isCurrentUser={client === username}
                      />
                  ))}
              </div>
          </div>
          <button className="btn copyBtn" onClick={copyRoomId}>
              Copy ROOM ID
          </button>
          <button className="btn leaveBtn" onClick={leaveRoom}>
              Leave
          </button>
      </div>
      <div className="editorWrap">
          <div className="editor-container" style={{ height: '100vh' }}> {}
              <ReactQuill 
                  ref={quillRef}
                  theme="snow"
                  modules={modules}
                  placeholder='Start collaborating As a Team...'
                  style={{ height: '100%' }}
                />
          </div>
      </div>
    </div>
  );
};

export default EditorPage;