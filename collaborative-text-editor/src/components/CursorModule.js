class CursorModule {
    constructor(quill) {
      this.quill = quill;
      this.cursors = {};
      this.container = this.quill.addContainer('ql-cursors');
    }

    updateCursorPosition(userId, cursorPosition, userName) {
      this.removeCursor(userId);
  
      const cursorElement = document.createElement('span');
      cursorElement.classList.add('cursor');
      cursorElement.style.position = 'absolute';
      cursorElement.style.height = '1em';
      cursorElement.style.width = '2px';
      cursorElement.style.backgroundColor = 'blue';
      cursorElement.setAttribute('data-user', userId);
  
      const labelElement = document.createElement('span');
      labelElement.classList.add('cursor-label');
      labelElement.textContent = userName;
      labelElement.style.position = 'absolute';
      labelElement.style.backgroundColor = '#FFFF00';
      labelElement.style.fontSize = '12px';
      labelElement.style.padding = '2px';
      labelElement.style.borderRadius = '4px';
      labelElement.style.whiteSpace = 'nowrap';
  
      cursorElement.appendChild(labelElement);
  
      const quillBounds = this.quill.getBounds(cursorPosition);
      cursorElement.style.top = `${quillBounds.top}px`;
      cursorElement.style.left = `${quillBounds.left}px`;
      
      labelElement.style.top = `${quillBounds.top - labelElement.offsetHeight}px`;
      labelElement.style.left = `${quillBounds.left}px`;
  
      this.container.appendChild(cursorElement);
  
      this.cursors[userId] = cursorElement;
      setTimeout(() => this.removeCursor(userId), 2000);
    }
  
    removeCursor(userId) {
      const cursorElement = this.cursors[userId];
      if (cursorElement) {
        cursorElement.remove();
        delete this.cursors[userId];
      }
    }
  }

  export default CursorModule;