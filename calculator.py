import tkinter as tk
from tkinter import ttk
import math
import cmath

class Calculator:
    def __init__(self, root):
        self.root = root
        self.root.title("计算器")
        self.root.geometry("420x580")
        self.root.resizable(False, False)
        
        self.mode = 'standard'
        self.current_input = '0'
        self.previous_input = ''
        self.operation = None
        self.memory = 0
        self.degrees = True
        
        self.setup_styles()
        self.create_widgets()
        self.setup_keyboard_bindings()
    
    def setup_styles(self):
        style = ttk.Style()
        style.theme_use('clam')
        
        style.configure('Display.TLabel', 
                       background='#1e1e1e', 
                       foreground='#ffffff',
                       font=('Segoe UI', 28),
                       padding=15,
                       anchor='e')
        
        style.configure('Num.TButton',
                       background='#333333',
                       foreground='#ffffff',
                       font=('Segoe UI', 14),
                       padding=10)
        
        style.configure('Op.TButton',
                       background='#0078d4',
                       foreground='#ffffff',
                       font=('Segoe UI', 14),
                       padding=10)
        
        style.configure('Func.TButton',
                       background='#444444',
                       foreground='#ffffff',
                       font=('Segoe UI', 12),
                       padding=8)
        
        style.configure('Sci.TButton',
                       background='#555555',
                       foreground='#ffffff',
                       font=('Segoe UI', 11),
                       padding=6)
        
        style.map('Num.TButton',
                  background=[('active', '#555555'), ('pressed', '#666666')])
        
        style.map('Op.TButton',
                  background=[('active', '#005a9e'), ('pressed', '#004a87')])
        
        style.map('Func.TButton',
                  background=[('active', '#666666'), ('pressed', '#777777')])
        
        style.map('Sci.TButton',
                  background=[('active', '#777777'), ('pressed', '#888888')])
    
    def create_widgets(self):
        self.main_frame = ttk.Frame(self.root)
        self.main_frame.pack(fill='both', expand=True)
        
        self.create_display()
        self.create_mode_switch()
        self.create_standard_buttons()
        self.create_scientific_buttons()
        
        self.scientific_frame.pack_forget()
    
    def create_display(self):
        self.display_var = tk.StringVar(value='0')
        self.display = ttk.Label(self.main_frame, textvariable=self.display_var, style='Display.TLabel')
        self.display.grid(row=0, column=0, columnspan=4, sticky='nsew')
        
        self.main_frame.grid_rowconfigure(0, weight=1)
        for i in range(4):
            self.main_frame.grid_columnconfigure(i, weight=1)
    
    def create_mode_switch(self):
        mode_frame = ttk.Frame(self.main_frame)
        mode_frame.grid(row=1, column=0, columnspan=4, sticky='ew')
        
        self.standard_btn = ttk.Button(mode_frame, text='标准', 
                                       command=lambda: self.switch_mode('standard'),
                                       style='Func.TButton')
        self.standard_btn.pack(side='left', fill='both', expand=True, padx=2, pady=2)
        
        self.scientific_btn = ttk.Button(mode_frame, text='科学',
                                         command=lambda: self.switch_mode('scientific'),
                                         style='Func.TButton')
        self.scientific_btn.pack(side='left', fill='both', expand=True, padx=2, pady=2)
    
    def create_standard_buttons(self):
        self.standard_frame = ttk.Frame(self.main_frame)
        self.standard_frame.grid(row=2, column=0, columnspan=4, sticky='nsew')
        
        buttons = [
            ['CE', 'C', '⌫', '/'],
            ['7', '8', '9', '*'],
            ['4', '5', '6', '-'],
            ['1', '2', '3', '+'],
            ['±', '0', '.', '=']
        ]
        
        for row, row_buttons in enumerate(buttons):
            for col, text in enumerate(row_buttons):
                if text in ['/', '*', '-', '+', '=']:
                    style = 'Op.TButton'
                elif text in ['CE', 'C', '⌫', '±']:
                    style = 'Func.TButton'
                else:
                    style = 'Num.TButton'
                
                btn = ttk.Button(self.standard_frame, text=text, 
                                command=lambda t=text: self.on_button_click(t),
                                style=style)
                btn.grid(row=row, column=col, sticky='nsew', padx=2, pady=2)
                self.standard_frame.grid_rowconfigure(row, weight=1)
                self.standard_frame.grid_columnconfigure(col, weight=1)
    
    def create_scientific_buttons(self):
        self.scientific_frame = ttk.Frame(self.main_frame)
        self.scientific_frame.grid(row=2, column=0, columnspan=4, sticky='nsew')
        
        sci_buttons = [
            ['deg', 'sin', 'cos', 'tan', 'log'],
            ['hyp', 'asin', 'acos', 'atan', 'ln'],
            ['x²', 'x³', 'xʸ', 'eˣ', '10ˣ'],
            ['¹/x', '√x', '∛x', '|x|', 'π'],
            ['n!', 'Mod', 'e', 'Rand', '('],
            ['MC', 'MR', 'M+', 'M-', ')']
        ]
        
        for row, row_buttons in enumerate(sci_buttons):
            for col, text in enumerate(row_buttons):
                btn = ttk.Button(self.scientific_frame, text=text,
                                command=lambda t=text: self.on_button_click(t),
                                style='Sci.TButton')
                btn.grid(row=row, column=col, sticky='nsew', padx=1, pady=1)
                self.scientific_frame.grid_rowconfigure(row, weight=1)
                self.scientific_frame.grid_columnconfigure(col, weight=1)
        
        std_buttons = [
            ['7', '8', '9', '/'],
            ['4', '5', '6', '*'],
            ['1', '2', '3', '-'],
            ['±', '0', '.', '+'],
            ['CE', 'C', '⌫', '=']
        ]
        
        for row, row_buttons in enumerate(std_buttons):
            for col, text in enumerate(row_buttons):
                if text in ['/', '*', '-', '+', '=']:
                    style = 'Op.TButton'
                elif text in ['CE', 'C', '⌫', '±']:
                    style = 'Func.TButton'
                else:
                    style = 'Num.TButton'
                
                btn = ttk.Button(self.scientific_frame, text=text,
                                command=lambda t=text: self.on_button_click(t),
                                style=style)
                btn.grid(row=row + 6, column=col, sticky='nsew', padx=2, pady=2)
                self.scientific_frame.grid_rowconfigure(row + 6, weight=1)
    
    def switch_mode(self, mode):
        self.mode = mode
        if mode == 'standard':
            self.scientific_frame.pack_forget()
            self.standard_frame.grid(row=2, column=0, columnspan=4, sticky='nsew')
            self.root.geometry("420x580")
        else:
            self.standard_frame.grid_forget()
            self.scientific_frame.grid(row=2, column=0, columnspan=4, sticky='nsew')
            self.root.geometry("420x780")
    
    def on_button_click(self, text):
        if text.isdigit():
            self.input_digit(text)
        elif text == '.':
            self.input_decimal()
        elif text in ['+', '-', '*', '/']:
            self.set_operation(text)
        elif text == '=':
            self.calculate()
        elif text == 'C':
            self.clear_all()
        elif text == 'CE':
            self.clear_entry()
        elif text == '⌫':
            self.backspace()
        elif text == '±':
            self.toggle_sign()
        elif text == 'deg':
            self.toggle_degrees()
        elif text in ['sin', 'cos', 'tan', 'asin', 'acos', 'atan']:
            self.trig_function(text)
        elif text in ['log', 'ln']:
            self.log_function(text)
        elif text in ['x²', 'x³', 'xʸ', 'eˣ', '10ˣ']:
            self.power_function(text)
        elif text in ['¹/x', '√x', '∛x']:
            self.root_function(text)
        elif text == '|x|':
            self.absolute_value()
        elif text == 'π':
            self.input_pi()
        elif text == 'e':
            self.input_e()
        elif text == 'n!':
            self.factorial()
        elif text == 'Mod':
            self.set_operation('%')
        elif text == 'Rand':
            self.random_number()
        elif text in ['(', ')']:
            self.input_parenthesis(text)
        elif text.startswith('M'):
            self.memory_operation(text)
        elif text == 'hyp':
            self.hyperbolic_mode()
    
    def input_digit(self, digit):
        if self.current_input == '0':
            self.current_input = digit
        else:
            self.current_input += digit
        self.update_display()
    
    def input_decimal(self):
        if '.' not in self.current_input:
            self.current_input += '.'
        self.update_display()
    
    def set_operation(self, op):
        if self.previous_input:
            self.calculate()
        self.previous_input = self.current_input
        self.operation = op
        self.current_input = '0'
        self.update_display()
    
    def calculate(self):
        if not self.previous_input or not self.operation:
            return
        
        try:
            num1 = float(self.previous_input)
            num2 = float(self.current_input)
            
            result = 0
            if self.operation == '+':
                result = num1 + num2
            elif self.operation == '-':
                result = num1 - num2
            elif self.operation == '*':
                result = num1 * num2
            elif self.operation == '/':
                if num2 == 0:
                    self.current_input = '错误'
                    self.update_display()
                    return
                result = num1 / num2
            elif self.operation == '%':
                result = num1 % num2
            
            self.current_input = str(result)
            self.previous_input = ''
            self.operation = None
            self.update_display()
        except Exception:
            self.current_input = '错误'
            self.update_display()
    
    def clear_all(self):
        self.current_input = '0'
        self.previous_input = ''
        self.operation = None
        self.update_display()
    
    def clear_entry(self):
        self.current_input = '0'
        self.update_display()
    
    def backspace(self):
        if len(self.current_input) > 1:
            self.current_input = self.current_input[:-1]
        else:
            self.current_input = '0'
        self.update_display()
    
    def toggle_sign(self):
        if self.current_input != '0':
            if self.current_input.startswith('-'):
                self.current_input = self.current_input[1:]
            else:
                self.current_input = '-' + self.current_input
            self.update_display()
    
    def toggle_degrees(self):
        self.degrees = not self.degrees
        self.update_display()
    
    def trig_function(self, func):
        try:
            num = float(self.current_input)
            if not self.degrees:
                num = math.radians(num)
            
            if func == 'sin':
                result = math.sin(num)
            elif func == 'cos':
                result = math.cos(num)
            elif func == 'tan':
                result = math.tan(num)
            elif func == 'asin':
                result = math.asin(num)
                if self.degrees:
                    result = math.degrees(result)
            elif func == 'acos':
                result = math.acos(num)
                if self.degrees:
                    result = math.degrees(result)
            elif func == 'atan':
                result = math.atan(num)
                if self.degrees:
                    result = math.degrees(result)
            
            self.current_input = str(result)
            self.update_display()
        except Exception:
            self.current_input = '错误'
            self.update_display()
    
    def log_function(self, func):
        try:
            num = float(self.current_input)
            if func == 'log':
                result = math.log10(num)
            elif func == 'ln':
                result = math.log(num)
            
            self.current_input = str(result)
            self.update_display()
        except Exception:
            self.current_input = '错误'
            self.update_display()
    
    def power_function(self, func):
        try:
            num = float(self.current_input)
            
            if func == 'x²':
                result = num ** 2
            elif func == 'x³':
                result = num ** 3
            elif func == 'eˣ':
                result = math.exp(num)
            elif func == '10ˣ':
                result = 10 ** num
            elif func == 'xʸ':
                self.previous_input = self.current_input
                self.operation = '^'
                self.current_input = '0'
            
            if func != 'xʸ':
                self.current_input = str(result)
                self.update_display()
        except Exception:
            self.current_input = '错误'
            self.update_display()
    
    def root_function(self, func):
        try:
            num = float(self.current_input)
            
            if func == '√x':
                result = math.sqrt(num)
            elif func == '∛x':
                result = num ** (1/3)
            elif func == '¹/x':
                if num == 0:
                    self.current_input = '错误'
                    self.update_display()
                    return
                result = 1 / num
            
            self.current_input = str(result)
            self.update_display()
        except Exception:
            self.current_input = '错误'
            self.update_display()
    
    def absolute_value(self):
        try:
            num = float(self.current_input)
            self.current_input = str(abs(num))
            self.update_display()
        except Exception:
            self.current_input = '错误'
            self.update_display()
    
    def input_pi(self):
        self.current_input = str(math.pi)
        self.update_display()
    
    def input_e(self):
        self.current_input = str(math.e)
        self.update_display()
    
    def factorial(self):
        try:
            num = int(float(self.current_input))
            if num < 0:
                self.current_input = '错误'
                self.update_display()
                return
            result = math.factorial(num)
            self.current_input = str(result)
            self.update_display()
        except Exception:
            self.current_input = '错误'
            self.update_display()
    
    def random_number(self):
        import random
        self.current_input = str(random.random())
        self.update_display()
    
    def input_parenthesis(self, text):
        if self.current_input == '0':
            self.current_input = text
        else:
            self.current_input += text
        self.update_display()
    
    def memory_operation(self, op):
        if op == 'MC':
            self.memory = 0
        elif op == 'MR':
            self.current_input = str(self.memory)
            self.update_display()
        elif op == 'M+':
            try:
                self.memory += float(self.current_input)
            except Exception:
                pass
        elif op == 'M-':
            try:
                self.memory -= float(self.current_input)
            except Exception:
                pass
    
    def hyperbolic_mode(self):
        pass
    
    def update_display(self):
        if len(self.current_input) > 20:
            self.current_input = self.current_input[:20]
        self.display_var.set(text=self.current_input)
    
    def setup_keyboard_bindings(self):
        self.root.bind('<Key>', self.on_key_press)
    
    def on_key_press(self, event):
        key = event.char
        
        if key.isdigit():
            self.input_digit(key)
        elif key == '.':
            self.input_decimal()
        elif key in ['+', '-', '*', '/']:
            self.set_operation(key)
        elif key == '=' or key == '\r':
            self.calculate()
        elif key == 'c' or key == 'C':
            self.clear_all()
        elif key == '\b':
            self.backspace()
        elif key == 'Escape':
            self.clear_all()

if __name__ == '__main__':
    root = tk.Tk()
    app = Calculator(root)
    root.mainloop()