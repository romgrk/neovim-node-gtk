/*
 * application.js
 */


const path = require('path')
const child_process = require('child_process')
const EventEmitter = require('events')
const chalk = require('chalk')
const { attach } = require('promised-neovim-client')

const UI = require('./actions/ui.js')
const Command = require('./actions/command.js')


class Application extends EventEmitter {

  static getRuntimeDirectory() {
    return path.join(__dirname, '../runtime/')
  }


  constructor(store) {
    super()
    this.store = store
  }

  start(command, argv, lines, columns) {
    let err

    argv.unshift('--embed')

    this.neovim_process = child_process.spawn(
      command,
      argv,
      { stdio: ['pipe', 'pipe', process.stderr] }
    )

    this.neovim_process.on('error', (e) => {
      err = e
      console.error(err)
    })

    if (err || this.neovim_process.pid === undefined) {
      return Promise.reject(err || new Error('Failed to spawn process: ' + this.command));
    }

    return attach(this.neovim_process.stdin, this.neovim_process.stdout).then(nvim => {
      this.client = nvim
      nvim.on('request', this.onRequested.bind(this))
      nvim.on('notification', this.onNotified.bind(this))
      nvim.on('disconnect', this.onDisconnect.bind(this)) 
      nvim.uiAttach(columns, lines, true, true /* notify */)
      this.started = true

      console.log(`nvim attached: ${this.neovim_process.pid} ${lines}x${columns} ${JSON.stringify(argv)}`)

      // this.store.on('update-screen-bounds', () => nvim.uiTryResize(this.store.size.cols, this.store.size.lines))

      // Note: Neovim frontend has responsiblity to emit 'GUIEnter' on initialization
      this.client.command('doautocmd <nomodeline> GUIEnter', true)

      this.emit('start')
    })
  }

  onRequested(method, args, response) {
      console.log('requested: ', method, args, response);
  }

  onNotified(method, args) {
    if (method === 'redraw') {
      try { // FIXME(remove)
        this.redraw(args);
      } catch (err) {
        console.error(err);
      }
    }
    else if (method === 'autocmd') {
      const [eventName, [bufferNumbder, line, column]] = args
      console.warn(chalk.bold.red('Unhandled autocmd: '), args);
    }
    else if (method === 'command') {
      const [[cmdName, ...cmdArgs]] = args
      console.warn(chalk.bold.red('Command: '), args);
      this.handleCommand(cmdName, cmdArgs)
    }
    else {
      // User defined notifications are passed here.
      console.log('Unknown method', { method, args });
      process.exit(0)
    }
  }

  onDisconnect() {
      console.log('disconnected: ' + this.neovim_process.pid);
      this.started = false;
      this.emit('disconnect')
  }

  quit() {
      if (!this.started)
        return Promise.resolve()
      this.started = false
      return this.client.uiDetach().then(() => {
          this.client.quit()
      })
  }

  handleCommand(name, args) {
    const d = this.store.dispatcher;

    switch (name) {
      case 'FileFinder': {
        if (this.store.finder.open)
          d.dispatch(Command.fileFinderClose())
        else
          d.dispatch(Command.fileFinderOpen())
        break
      }
      default: {
        console.warn(chalk.bold.red('Unhandled command: '), name, args);
      }
    }
  }

  redraw(events) {
    const d = this.store.dispatcher;

    for (const e of events) {
      const name = e[0];
      const args = e[1];

      console.log(name, e.slice(1))

      switch (name) {
          case 'put':
              e.shift();
              if (e.length !== 0) {
                  d.dispatch(UI.putText(e));
              }
              break;
          case 'cursor_goto':
              d.dispatch(UI.cursor(args[0], args[1]));
              break;
          case 'highlight_set':
              e.shift();

              // [[{highlight_set}], [], [{highlight_set}], ...] -> [{highlight_set}, {highlight_set}, ...]
              const highlights = [].concat.apply([], e);

              // [{highlight_set}, {highlight_set}, ...] -> {merged highlight_set}
              highlights.unshift({});

              const merged_highlight = Object.assign.apply(Object, highlights);

              d.dispatch(UI.highlight(merged_highlight));
              break;
          case 'clear':
              d.dispatch(UI.clearAll());
              break;
          case 'eol_clear':
              d.dispatch(UI.clearEndOfLine());
              break;
          case 'scroll':
              d.dispatch(UI.scrollScreen(args[0]));
              break;
          case 'set_scroll_region':
              d.dispatch(
                  UI.setScrollRegion({
                      top:    args[0],
                      bottom: args[1],
                      left:   args[2],
                      right:  args[3],
                  }),
              );
              break;
          case 'resize':
              d.dispatch(UI.resize(args[1], args[0]));
              break;
          case 'update_fg':
              d.dispatch(UI.updateForeground(args[0]));
              break;
          case 'update_bg':
              d.dispatch(UI.updateBackground(args[0]));
              break;
          case 'update_sp':
              d.dispatch(UI.updateSpecialColor(args[0]));
              break;
          case 'mode_info_set':
              // Note:
              // [{mode_info_set}, {mode_info_set}]
              //   -> { [mode_name]: {mode_info_set} }
              const modeInfo = args[1];

              d.dispatch(
                  UI.modeInfo(
                      modeInfo.reduce((set, info) => {
                          set[info.name] = info;
                          return set;
                      }, Object.create(null)),
                  ),
              );
              break;
          case 'mode_change':
              d.dispatch(UI.changeMode(args[0]));
              break;
          case 'busy_start':
              d.dispatch(UI.startBusy());
              break;
          case 'busy_stop':
              d.dispatch(UI.stopBusy());
              break;
          case 'mouse_on':
              d.dispatch(UI.enableMouse());
              break;
          case 'mouse_off':
              d.dispatch(UI.disableMouse());
              break;
          case 'bell':
              d.dispatch(UI.bell(false));
              break;
          case 'visual_bell':
              d.dispatch(UI.bell(true));
              break;
          case 'set_title':
              d.dispatch(UI.setTitle(args[0]));
              break;
          case 'set_icon':
              d.dispatch(UI.setIcon(args[0]));
              break;
          case 'flush':
              d.dispatch(UI.flush());
              break;
          default:
              console.warn(chalk.bold.red('Unhandled event: ') + name, args);
              break;
      }
    }
  }
}

module.exports = Application
