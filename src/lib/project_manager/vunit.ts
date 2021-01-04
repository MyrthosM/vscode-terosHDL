import * as vscode from 'vscode';
const path_lib = require('path');
const os = require('os');
const shell = require('shelljs');
const fs = require('fs');

export class Vunit {
  private output_channel;
  private exp: string = '';
  private more: string = '';
  private folder_sep: string = '';

  constructor() {
    this.output_channel = vscode.window.createOutputChannel('TerosHDL');

    this.exp = "export ";
    this.more = ";";
    this.folder_sep = "/";

    if (os.platform === "win32") {
      this.exp = "SET ";
      this.more = "&&";
      this.folder_sep = "\\";
    }
  }

  async run_simulation(python3_path, selected_tool_configuration, all_tool_configuration, runpy_path, tests: string[] = [], gui = false) {
    let simulator = selected_tool_configuration.options.simulator;
    let simulator_install_path = '';
    for (let i = 0; i < all_tool_configuration.length; i++) {
      const tool = all_tool_configuration[i];
      if (tool.name === simulator) {
        simulator_install_path = tool.installation_path;
        break;
      }
    }

    let runpy_dirname = path_lib.dirname(runpy_path);
    let runpy_filename = path_lib.basename(runpy_path);
    let command = this.get_command(python3_path, runpy_dirname,
      runpy_filename, simulator, simulator_install_path, gui, false, tests);
    let result = await this.run_command(command, runpy_dirname);
    return result;
  }

  get_command(python3_path, runpy_dirname, runpy_filename, simulator,
    simulator_install_path, gui, list = false, tests: string[] = []) {
    let tests_cmd = ' ';
    for (let i = 0; i < tests.length; i++) {
      if (i === 0) {
        tests_cmd += '"';
      }
      const element = tests[i];
      if (i === tests.length - 1) {
        tests_cmd += `${element}"`;
      }
    }

    let list_cmd = '';
    if (list === true) {
      list_cmd = '--export-json teroshdl_export.json';
    }

    let gui_cmd = '';
    if (gui === true) {
      gui_cmd = '--gui';
    }

    let simulator_config = this.get_simulator_config(simulator, simulator_install_path);
    let go_to_dir = `cd ${runpy_dirname}${this.more}`;
    let vunit_default_options = `--no-color -x teroshdl_out.xml --exit-0 --verbose ${gui_cmd} ${list_cmd}`;
    let command = `${simulator_config}${go_to_dir}${python3_path} ${runpy_filename} ${tests_cmd} ${vunit_default_options}`;

    return command;
  }

  get_simulator_config(simulator_name, simulator_install_path) {
    let simulator_name_up = simulator_name.toUpperCase();
    let simulator_name_low = simulator_name.toLowerCase();

    let simulator_cmd = `${this.exp} VUNIT_${simulator_name_up}_PATH=${simulator_install_path}${this.more}${this.exp} VUNIT_SIMULATOR=${simulator_name_low}${this.more}`;

    return simulator_cmd;
  }

  async run_command(command, runpy_dirname) {
    let element = this;

    element.output_channel.append(command);
    element.output_channel.show();

    return new Promise(resolve => {
      let childp = shell.exec(command, { async: true }, async function (code, stdout, stderr) {
        if (code === 0) {
          let results = await element.get_result(runpy_dirname);
          resolve(results);
        }
      });

      childp.stdout.on('data', function (data) {
        element.output_channel.append(data);
        element.output_channel.show();
      });
      childp.stderr.on('data', function (data) {
        element.output_channel.append(data);
        element.output_channel.show();
      });
    });
  }

  async get_result(folder) {
    const result_file = `${folder}${this.folder_sep}teroshdl_out.xml`;
    const xml2js = require('xml2js');
    const parser = new xml2js.Parser({ attrkey: "atrr" });

    // this example reads the file synchronously
    // you can read it asynchronously also
    let xml_string = fs.readFileSync(result_file, "utf8");

    return new Promise(resolve => {
      parser.parseString(xml_string, function (error, result) {
        let testsuites = result.testsuite;
        let testcase = testsuites.testcase;
        let results: {}[] = [];
        for (let i = 0; i < testcase.length; i++) {
          const test = testcase[i];
          let test_name = `${test.atrr.classname}.${test.atrr.name}`;
          let pass = true;
          if (test.failure !== undefined) {
            pass = false;
          }
          let test_info = {
            name: test_name,
            pass: pass
          };
          results.push(test_info);
        }
        resolve(results);
      });
    });
  }

  async get_test_list(python3_path, runpy_path) {
    let runpy_dirname = path_lib.dirname(runpy_path);
    let runpy_filename = path_lib.basename(runpy_path);
    let json_path = `${runpy_dirname}${this.folder_sep}teroshdl_export.json`;
    let simulator = 'ghdl';
    let simulator_install_path = '';
    let gui = false;
    let list = true;

    let command = this.get_command(python3_path, runpy_dirname, runpy_filename, simulator, simulator_install_path, gui, list);

    return new Promise(resolve => {

      shell.exec(command, { async: true }, function (code, stdout, stderr) {
        if (code === 0 && fs.existsSync(json_path)) {
          let obj = JSON.parse(fs.readFileSync(json_path, 'utf8'));
          resolve(obj.tests);
        }
        else {
          resolve([]);
        }
      });
    });

  }
}